import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma, tracker } from '../index.js';
import { LIMITS, EVENT_TYPES } from '@tanish/shared';
import { rankCandidates } from '@tanish/matching';

export async function discoveryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // GET /api/discovery/batch — get today's match batch
  app.get('/batch', async (request, reply) => {
    const userId = request.userId;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, city: true, gender: true, genderPref: true,
        minAge: true, maxAge: true, eloScore: true, isPremium: true,
        university: true, workplace: true, bio: true, lastActiveAt: true,
        verified: true, profileComplete: true,
        interests: { select: { interestId: true } },
        photos: { select: { id: true } },
      },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    const maxProfiles = user.isPremium ? LIMITS.PREMIUM_DAILY_MATCHES : LIMITS.FREE_DAILY_MATCHES;

    // Check for existing batch
    let batch = await prisma.dailyBatch.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    // Generate on-the-fly if no batch exists (cron runs at 09:00,
    // but users who open before that or new users need immediate batches)
    if (!batch) {
      const profileIds = await generateBatchForUser(user, maxProfiles);
      batch = await prisma.dailyBatch.create({
        data: { userId, date: today, profiles: profileIds },
      });
    }

    // Fetch full profiles for the batch
    const profiles = await prisma.user.findMany({
      where: { id: { in: batch.profiles } },
      select: {
        id: true, firstName: true, lastName: true, gender: true,
        lookingFor: true, birthDate: true, city: true, bio: true,
        currentRole: true, university: true, verified: true, isPremium: true,
        photos: { orderBy: { position: 'asc' } },
        interests: { include: { interest: true } },
      },
    });

    // Get viewer's interests for "shared interests" highlighting
    const viewerInterestIds = new Set(user.interests.map((i) => i.interestId));

    // Filter out already-actioned profiles
    const existingLikes = await prisma.like.findMany({
      where: { senderId: userId, receiverId: { in: batch.profiles } },
      select: { receiverId: true },
    });
    const actionedIds = new Set(existingLikes.map((l) => l.receiverId));

    const enrichedProfiles = profiles
      .filter((p) => !actionedIds.has(p.id))
      .map((profile) => {
        const age = Math.floor(
          (Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        );

        const interests = profile.interests.map((ui) => ({
          ...ui.interest,
          isShared: viewerInterestIds.has(ui.interestId),
        }));

        const sharedCount = interests.filter((i) => i.isShared).length;
        const matchLabel = sharedCount >= 4 ? 'great' : sharedCount >= 2 ? 'good' : 'decent';

        return {
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
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
          matchLabel,
        };
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

  // POST /api/discovery/action — like or pass
  app.post('/action', async (request, reply) => {
    const userId = request.userId;
    const { profileId, isLike } = request.body as { profileId: string; isLike: boolean };

    if (!profileId) {
      return reply.status(400).send({ success: false, error: 'profileId is required' });
    }

    // Verify profile exists
    const target = await prisma.user.findUnique({
      where: { id: profileId },
      select: { id: true },
    });
    if (!target) {
      return reply.status(404).send({ success: false, error: 'Profile not found' });
    }

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

    return reply.send({ success: true, data: { recorded: true } });
  });
}

/**
 * Generate batch using @tanish/matching scoring algorithm.
 */
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
    workplace: string | null;
    bio: string | null;
    lastActiveAt: Date;
    verified: boolean;
    interests: { interestId: string }[];
    photos: { id: string }[];
  },
  maxProfiles: number
): Promise<string[]> {
  // Build exclusion set
  const [blocks, existingLikes, activeIntros] = await Promise.all([
    prisma.block.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      select: { blockerId: true, blockedId: true },
    }),
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
  for (const b of blocks) { excludeIds.add(b.blockerId); excludeIds.add(b.blockedId); }
  for (const l of existingLikes) { excludeIds.add(l.receiverId); }
  for (const i of activeIntros) { excludeIds.add(i.senderId); excludeIds.add(i.receiverId); }
  excludeIds.delete(user.id);

  // Age range → birthdate range
  const now = new Date();
  const maxBirthDate = new Date(now.getFullYear() - user.minAge, now.getMonth(), now.getDate());
  const minBirthDate = new Date(now.getFullYear() - user.maxAge - 1, now.getMonth(), now.getDate());

  const candidates = await prisma.user.findMany({
    where: {
      id: { notIn: Array.from(excludeIds) },
      city: user.city,
      status: 'ACTIVE',
      profileComplete: true,
      birthDate: { gte: minBirthDate, lte: maxBirthDate },
      ...(user.genderPref ? { gender: user.genderPref as any } : {}),
    },
    select: {
      id: true, eloScore: true, lastActiveAt: true,
      university: true, workplace: true, bio: true,
      verified: true, isPremium: true,
      interests: { select: { interestId: true } },
      photos: { select: { id: true } },
    },
    take: maxProfiles * 5,
    orderBy: { eloScore: 'desc' },
  });

  if (candidates.length === 0) return [];

  // Use @tanish/matching for proper scoring
  const userForMatching = {
    id: user.id,
    eloScore: user.eloScore,
    lastActiveAt: user.lastActiveAt,
    interests: user.interests.map((i) => i.interestId),
    university: user.university,
    workplace: user.workplace,
    bio: user.bio,
    photoCount: user.photos.length,
    verified: user.verified,
    isPremium: user.isPremium,
  };

  const candidatesForMatching = candidates.map((c) => ({
    id: c.id,
    eloScore: c.eloScore,
    lastActiveAt: c.lastActiveAt,
    interests: c.interests.map((i) => i.interestId),
    university: c.university,
    workplace: c.workplace,
    bio: c.bio,
    photoCount: c.photos.length,
    verified: c.verified,
    isPremium: c.isPremium,
  }));

  const ranked = rankCandidates(userForMatching, candidatesForMatching, maxProfiles);
  return ranked.map((r) => r.userId);
}
