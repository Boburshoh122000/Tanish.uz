import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma } from '../index.js';
import { LIMITS } from '@tanish/shared';

export async function discoveryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // GET /api/discovery/batch — get today's match batch
  app.get('/batch', async (request, reply) => {
    const userId = (request as any).userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check for existing batch
    let batch = await prisma.dailyBatch.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    const maxProfiles = user.isPremium ? LIMITS.PREMIUM_DAILY_MATCHES : LIMITS.FREE_DAILY_MATCHES;

    // Generate batch on-the-fly if not exists (for MVP; cron-based in production)
    if (!batch) {
      const profileIds = await generateBatchForUser(userId, user, maxProfiles);
      batch = await prisma.dailyBatch.create({
        data: { userId, date: today, profiles: profileIds },
      });
    }

    // Fetch full profiles
    const profiles = await prisma.user.findMany({
      where: { id: { in: batch.profiles } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        lookingFor: true,
        birthDate: true,
        city: true,
        bio: true,
        currentRole: true,
        university: true,
        verified: true,
        isPremium: true,
        photos: { orderBy: { position: 'asc' } },
        interests: { include: { interest: true } },
      },
    });

    // Get viewer interests for shared interest highlighting
    const viewerInterests = await prisma.userInterest.findMany({
      where: { userId },
      select: { interestId: true },
    });
    const viewerInterestIds = new Set(viewerInterests.map((i) => i.interestId));

    // Check which profiles have already been actioned
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

        return {
          ...profile,
          age,
          interests,
          sharedInterests: interests.filter((i) => i.isShared),
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

  // POST /api/discovery/action — like or pass a profile
  app.post('/action', async (request, reply) => {
    const userId = (request as any).userId;
    const { profileId, isLike } = request.body as { profileId: string; isLike: boolean };

    if (!profileId) {
      return reply.status(400).send({ success: false, error: 'profileId is required' });
    }

    // Upsert like
    await prisma.like.upsert({
      where: { senderId_receiverId: { senderId: userId, receiverId: profileId } },
      create: { senderId: userId, receiverId: profileId, isLike },
      update: { isLike },
    });

    return reply.send({ success: true });
  });
}

async function generateBatchForUser(
  userId: string,
  user: any,
  maxProfiles: number
): Promise<string[]> {
  // Get blocked user IDs (both directions)
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedIds = new Set(
    blocks.flatMap((b) => [b.blockerId, b.blockedId]).filter((id) => id !== userId)
  );

  // Get already liked/passed IDs
  const existingLikes = await prisma.like.findMany({
    where: { senderId: userId },
    select: { receiverId: true },
  });
  const likedIds = new Set(existingLikes.map((l) => l.receiverId));

  // Get active intro IDs
  const activeIntros = await prisma.intro.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: { in: ['PENDING', 'MATCHED'] },
    },
    select: { senderId: true, receiverId: true },
  });
  const introIds = new Set(
    activeIntros.flatMap((i) => [i.senderId, i.receiverId]).filter((id) => id !== userId)
  );

  const excludeIds = new Set([userId, ...blockedIds, ...likedIds, ...introIds]);

  // Calculate age range from birthdates
  const now = new Date();
  const maxBirthDate = new Date(now.getFullYear() - user.minAge, now.getMonth(), now.getDate());
  const minBirthDate = new Date(now.getFullYear() - user.maxAge, now.getMonth(), now.getDate());

  // Query candidates
  const candidates = await prisma.user.findMany({
    where: {
      id: { notIn: Array.from(excludeIds) },
      city: user.city,
      status: 'ACTIVE',
      profileComplete: true,
      birthDate: { gte: minBirthDate, lte: maxBirthDate },
      ...(user.genderPref ? { gender: user.genderPref } : {}),
    },
    select: {
      id: true,
      eloScore: true,
      lastActiveAt: true,
      interests: { select: { interestId: true } },
      university: true,
      workplace: true,
      bio: true,
      photos: { select: { id: true } },
      verified: true,
    },
    take: 50,
    orderBy: { eloScore: 'desc' },
  });

  // Get user interests
  const userInterests = await prisma.userInterest.findMany({
    where: { userId },
    select: { interestId: true },
  });
  const userInterestIds = new Set(userInterests.map((i) => i.interestId));

  // Score candidates
  const scored = candidates.map((candidate) => {
    const candidateInterestIds = candidate.interests.map((i) => i.interestId);
    const sharedCount = candidateInterestIds.filter((id) => userInterestIds.has(id)).length;
    const interestOverlap = sharedCount / Math.max(userInterestIds.size, 5);

    const sameUniversity = user.university && candidate.university === user.university ? 1 : 0;
    const sameWorkplace = user.workplace && candidate.workplace === user.workplace ? 1 : 0;
    const professionMatch = Math.max(sameUniversity, sameWorkplace);

    const daysSinceActive = (Date.now() - candidate.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24);
    const activityScore = Math.max(0, 1 - daysSinceActive / 7);

    const eloProximity = 1.0 - Math.abs(user.eloScore - candidate.eloScore) / 1000;

    const hasBio = candidate.bio ? 1 : 0;
    const hasPhotos = candidate.photos.length >= 2 ? 1 : 0;
    const isVerified = candidate.verified ? 1 : 0;
    const profileQuality = (hasBio + hasPhotos + isVerified) / 3;

    const score =
      interestOverlap * 0.30 +
      professionMatch * 0.25 +
      activityScore * 0.20 +
      eloProximity * 0.15 +
      profileQuality * 0.10;

    return { userId: candidate.id, score };
  });

  // Sort by score and take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxProfiles).map((s) => s.userId);
}
