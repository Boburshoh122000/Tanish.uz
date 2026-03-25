import { PrismaClient } from '@prisma/client';
import { LIMITS } from '@tanish/shared';
import { rankCandidates } from '@tanish/matching';
import type { NotificationService } from '../services/notification.service.js';

interface BatchStats {
  totalUsers: number;
  batchesGenerated: number;
  avgCandidates: number;
  durationMs: number;
}

/**
 * Generate daily match batches for all active users.
 * Runs at 04:00 UTC (09:00 Tashkent).
 * Processes users in chunks of 100.
 */
export async function generateDailyBatches(
  prisma: PrismaClient,
  notificationService: NotificationService | null,
  webAppUrl: string
): Promise<BatchStats> {
  const startTime = Date.now();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let totalUsers = 0;
  let batchesGenerated = 0;
  let totalCandidatesFound = 0;

  const CHUNK_SIZE = 100;
  let cursor: string | undefined;

  while (true) {
    // Fetch active users in chunks (cursor pagination)
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        profileComplete: true,
        lastActiveAt: { gte: sevenDaysAgo },
      },
      select: {
        id: true,
        city: true,
        gender: true,
        genderPref: true,
        minAge: true,
        maxAge: true,
        eloScore: true,
        isPremium: true,
        university: true,
        workplace: true,
        bio: true,
        lastActiveAt: true,
        verified: true,
        telegramId: true,
        notifyDailyBatch: true,
        interests: { select: { interestId: true } },
        photos: { select: { id: true } },
      },
      take: CHUNK_SIZE,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });

    if (users.length === 0) break;

    cursor = users[users.length - 1]!.id;
    totalUsers += users.length;

    for (const user of users) {
      try {
        // Check if batch already exists for today
        const existingBatch = await prisma.dailyBatch.findUnique({
          where: { userId_date: { userId: user.id, date: today } },
        });
        if (existingBatch) continue;

        const maxProfiles = user.isPremium
          ? LIMITS.PREMIUM_DAILY_MATCHES
          : LIMITS.FREE_DAILY_MATCHES;

        const profileIds = await findAndScoreCandidates(prisma, user, maxProfiles);
        totalCandidatesFound += profileIds.length;

        if (profileIds.length > 0) {
          await prisma.dailyBatch.create({
            data: {
              userId: user.id,
              date: today,
              profiles: profileIds,
            },
          });
          batchesGenerated++;

          // Send notification
          if (notificationService && user.notifyDailyBatch) {
            await notificationService.notifyDailyBatch(
              user.id,
              Number(user.telegramId),
              webAppUrl
            );
          }
        }
      } catch (err) {
        console.error(`Batch generation failed for user ${user.id}:`, err);
      }
    }

    // If we got less than CHUNK_SIZE, we're done
    if (users.length < CHUNK_SIZE) break;
  }

  const durationMs = Date.now() - startTime;
  const stats: BatchStats = {
    totalUsers,
    batchesGenerated,
    avgCandidates: batchesGenerated > 0
      ? Math.round(totalCandidatesFound / batchesGenerated)
      : 0,
    durationMs,
  };

  console.log(`📊 Daily batch generation complete:`, stats);

  return stats;
}

async function findAndScoreCandidates(
  prisma: PrismaClient,
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
  // Get excluded user IDs
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
  for (const b of blocks) {
    excludeIds.add(b.blockerId);
    excludeIds.add(b.blockedId);
  }
  for (const l of existingLikes) {
    excludeIds.add(l.receiverId);
  }
  for (const i of activeIntros) {
    excludeIds.add(i.senderId);
    excludeIds.add(i.receiverId);
  }
  excludeIds.delete(user.id); // Remove self re-add from sets

  // Age range → birthdate range
  const now = new Date();
  const maxBirthDate = new Date(now.getFullYear() - user.minAge, now.getMonth(), now.getDate());
  const minBirthDate = new Date(now.getFullYear() - user.maxAge - 1, now.getMonth(), now.getDate());

  // Query candidates (fetch more than needed for scoring)
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
      id: true,
      eloScore: true,
      lastActiveAt: true,
      university: true,
      workplace: true,
      bio: true,
      verified: true,
      isPremium: true,
      interests: { select: { interestId: true } },
      photos: { select: { id: true } },
    },
    take: maxProfiles * 5, // Fetch 5x for better scoring pool
    orderBy: { eloScore: 'desc' },
  });

  if (candidates.length === 0) return [];

  // Map to scoring format
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
