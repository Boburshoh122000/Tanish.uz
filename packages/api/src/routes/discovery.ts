import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma, tracker } from '../index.js';
import { LIMITS, EVENT_TYPES, discoveryActionSchema } from '@tanish/shared';
import { rankCandidates } from '@tanish/matching';
import { generateQuestion } from '../services/icebreaker.service.js';

export async function discoveryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // ─── GET /api/discovery/batch ───────────────────────────────────
  app.get('/discovery/batch', async (request, reply) => {
    const userId = request.userId;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, city: true, gender: true, genderPref: true,
        minAge: true, maxAge: true, eloScore: true, isPremium: true,
        university: true, currentRole: true, bio: true, lastActiveAt: true,
        verified: true, profileComplete: true,
        interests: { select: { interestId: true } },
        photos: { select: { id: true } },
        blocksCreated: { select: { blockedId: true } },
        blockedBy: { select: { blockerId: true } },
      },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const maxProfiles = user.isPremium
      ? LIMITS.PREMIUM_DAILY_MATCHES
      : LIMITS.FREE_DAILY_MATCHES;

    // Check for existing batch
    let batch = await prisma.dailyBatch.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    // Generate on-the-fly if no batch exists (cron runs at 09:00,
    // but users who open before that or new users need immediate batches)
    if (!batch) {
      const profileIds = await generateBatchForUser(user, maxProfiles);
      batch = await prisma.dailyBatch.upsert({
        where: { userId_date: { userId, date: today } },
        create: { userId, date: today, profiles: profileIds },
        update: { profiles: profileIds },
      });
    }

    // Fetch full profiles for the batch
    const profiles = await prisma.user.findMany({
      where: { id: { in: batch.profiles } },
      select: {
        id: true, firstName: true, lastName: true, gender: true,
        lookingFor: true, birthDate: true, city: true, bio: true,
        currentRole: true, university: true, verified: true, isPremium: true,
        username: true,
        photos: { orderBy: { position: 'asc' }, select: { id: true, url: true, position: true, verified: true } },
        interests: { include: { interest: true } },
      },
    });

    // Viewer's interests for "shared interests" highlighting
    const viewerInterestIds = new Set(user.interests.map((i: { interestId: string }) => i.interestId));

    // Filter out already-actioned profiles
    const existingLikes = await prisma.like.findMany({
      where: { senderId: userId, receiverId: { in: batch.profiles } },
      select: { receiverId: true },
    });
    const actionedIds = new Set(existingLikes.map((l: { receiverId: string }) => l.receiverId));

    const enrichedProfiles = profiles
      .filter((p) => !actionedIds.has(p.id))
      .map((profile) => {
        const age = Math.floor(
          (Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
        );

        const interests = profile.interests.map((ui) => ({
          ...ui.interest,
          isShared: viewerInterestIds.has(ui.interestId),
        }));

        return {
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          username: profile.username,
          age,
          city: profile.city,
          bio: profile.bio,
          currentRole: profile.currentRole,
          university: profile.university,
          verified: profile.verified,
          isPremium: profile.isPremium,
          lookingFor: profile.lookingFor,
          photos: profile.photos,
          interests,
          sharedInterests: interests.filter((i) => i.isShared),
        };
      });

    // Track batch view
    tracker.track(EVENT_TYPES.BATCH_VIEWED, userId, {
      batchSize: enrichedProfiles.length,
      isPremium: user.isPremium,
    });

    return reply.send({
      success: true,
      data: {
        profiles: enrichedProfiles,
        remaining: enrichedProfiles.length,
        total: maxProfiles,
        date: today.toISOString(),
      },
    });
  });

  // ─── POST /api/discovery/action ─────────────────────────────────
  app.post('/discovery/action', async (request, reply) => {
    const userId = request.userId;
    const parsed = discoveryActionSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request' },
        details: parsed.error.flatten(),
      });
    }

    const { profileId, action } = parsed.data;
    const isLike = action === 'like';

    // Verify target exists
    const target = await prisma.user.findUnique({
      where: { id: profileId },
      select: { id: true },
    });
    if (!target) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } });
    }

    // Upsert like/pass record
    await prisma.like.upsert({
      where: { senderId_receiverId: { senderId: userId, receiverId: profileId } },
      create: { senderId: userId, receiverId: profileId, isLike },
      update: { isLike },
    });

    // Track event
    tracker.track(
      isLike ? EVENT_TYPES.PROFILE_LIKED : EVENT_TYPES.PROFILE_PASSED,
      userId,
      { profileId },
    );

    // Compute remaining unactioned profiles in today's batch
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const batch = await prisma.dailyBatch.findUnique({
      where: { userId_date: { userId, date: today } },
      select: { profiles: true },
    });

    let remaining = 0;
    if (batch) {
      const actioned = await prisma.like.findMany({
        where: { senderId: userId, receiverId: { in: batch.profiles } },
        select: { receiverId: true },
      });
      remaining = batch.profiles.length - actioned.length;
    }

    return reply.send({ success: true, data: { remaining } });
  });

  // ─── GET /api/intros/question ───────────────────────────────────
  // Preview icebreaker question for a candidate — does NOT create an intro
  app.get('/intros/question', async (request, reply) => {
    const userId = request.userId;
    const { receiverId } = request.query as { receiverId?: string };

    if (!receiverId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'receiverId query param is required' },
      });
    }

    // Fetch both users' interests (with category for question selection)
    const [sender, receiver] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          interests: {
            select: { interestId: true, interest: { select: { category: true } } },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: receiverId, status: 'ACTIVE' },
        select: {
          interests: {
            select: { interestId: true, interest: { select: { category: true } } },
          },
        },
      }),
    ]);

    if (!sender) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sender not found' } });
    }
    if (!receiver) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Receiver not found' } });
    }

    const senderInterests = sender.interests.map((ui) => ({
      interestId: ui.interestId,
      category: ui.interest.category,
    }));
    const receiverInterests = receiver.interests.map((ui) => ({
      interestId: ui.interestId,
      category: ui.interest.category,
    }));

    const { question, category } = await generateQuestion(
      senderInterests,
      receiverInterests,
      userId,
    );

    return reply.send({
      success: true,
      data: { question, category },
    });
  });
}

// ───── Internal: on-the-fly batch generation ──────────────────────

async function generateBatchForUser(
  user: {
    id: string;
    city: string;
    genderPref: string | null;
    minAge: number;
    maxAge: number;
    eloScore: number;
    isPremium: boolean;
    university: string | null;
    currentRole: string | null;
    bio: string | null;
    lastActiveAt: Date;
    verified: boolean;
    interests: { interestId: string }[];
    photos: { id: string }[];
    blocksCreated: { blockedId: string }[];
    blockedBy: { blockerId: string }[];
  },
  maxProfiles: number,
): Promise<string[]> {
  // Build exclusion set: self + already liked/passed + blocked (both dirs) + active intros
  const [existingLikes, activeIntros] = await Promise.all([
    prisma.like.findMany({
      where: { senderId: user.id },
      select: { receiverId: true },
    }),
    prisma.intro.findMany({
      where: {
        OR: [{ senderId: user.id }, { receiverId: user.id }],
        status: { in: ['PENDING', 'MATCHED'] },
      },
      select: { senderId: true, receiverId: true },
    }),
  ]);

  const excludeIds = new Set<string>([user.id]);
  for (const b of user.blocksCreated) excludeIds.add(b.blockedId);
  for (const b of user.blockedBy) excludeIds.add(b.blockerId);
  for (const l of existingLikes) excludeIds.add(l.receiverId);
  for (const i of activeIntros) {
    excludeIds.add(i.senderId);
    excludeIds.add(i.receiverId);
  }
  // Ensure self is always excluded (intro loop could have re-added it)
  excludeIds.add(user.id);

  // Age range → birthdate range
  const now = new Date();
  const maxBirthDate = new Date(now.getFullYear() - user.minAge, now.getMonth(), now.getDate());
  const minBirthDate = new Date(now.getFullYear() - user.maxAge - 1, now.getMonth(), now.getDate());

  const candidates = await prisma.user.findMany({
    where: {
      id: { notIn: [...excludeIds] },
      city: user.city,
      status: 'ACTIVE',
      profileComplete: true,
      birthDate: { gte: minBirthDate, lte: maxBirthDate },
      ...(user.genderPref ? { gender: user.genderPref as 'MALE' | 'FEMALE' } : {}),
    },
    select: {
      id: true, eloScore: true, lastActiveAt: true,
      university: true, currentRole: true, bio: true,
      verified: true, isPremium: true,
      interests: { select: { interestId: true } },
      photos: { select: { id: true } },
    },
    take: maxProfiles * 5,
    orderBy: { eloScore: 'desc' },
  });

  if (candidates.length === 0) return [];

  const userForMatching = {
    id: user.id,
    eloScore: user.eloScore,
    lastActiveAt: user.lastActiveAt,
    interests: user.interests.map((i: { interestId: string }) => i.interestId),
    university: user.university,
    currentRole: user.currentRole,
    bio: user.bio,
    photoCount: user.photos.length,
    verified: user.verified,
    isPremium: user.isPremium,
  };

  const candidatesForMatching = candidates.map((c: {
    id: string;
    eloScore: number;
    lastActiveAt: Date;
    university: string | null;
    currentRole: string | null;
    bio: string | null;
    verified: boolean;
    isPremium: boolean;
    interests: { interestId: string }[];
    photos: { id: string }[];
  }) => ({
    id: c.id,
    eloScore: c.eloScore,
    lastActiveAt: c.lastActiveAt,
    interests: c.interests.map((i) => i.interestId),
    university: c.university,
    currentRole: c.currentRole,
    bio: c.bio,
    photoCount: c.photos.length,
    verified: c.verified,
    isPremium: c.isPremium,
  }));

  const ranked = rankCandidates(userForMatching, candidatesForMatching, maxProfiles);
  return ranked.map((r) => r.userId);
}
