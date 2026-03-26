import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { LIMITS } from '@tanish/shared';
import { rankCandidates } from './scoring.service.js';
import type { UserForScoring } from './scoring.service.js';

const BATCH_SIZE = 100;
const ACTIVE_WINDOW_DAYS = 7;

interface BatchStats {
  usersProcessed: number;
  avgCandidates: number;
  durationMs: number;
}

/**
 * Generate daily discovery batches for all eligible users.
 *
 * For each active user:
 *   1. Query eligible candidates (same city, gender pref, age range, not interacted)
 *   2. Score each candidate
 *   3. Take top N (3 free / 8 premium)
 *   4. Upsert into DailyBatch table
 *
 * Processes in cursor-paginated batches of 100.
 */
export async function generateBatches(
  prisma: PrismaClient,
  _redis: Redis,
): Promise<BatchStats> {
  const start = Date.now();
  const today = startOfDayUTC(new Date());
  const activeAfter = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let cursor: string | undefined;
  let usersProcessed = 0;
  let totalCandidates = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const users = await prisma.user.findMany({
      where: {
        lastActiveAt: { gte: activeAfter },
        status: 'ACTIVE',
        profileComplete: true,
      },
      select: {
        id: true,
        city: true,
        gender: true,
        genderPref: true,
        birthDate: true,
        minAge: true,
        maxAge: true,
        eloScore: true,
        lastActiveAt: true,
        isPremium: true,
        verified: true,
        bio: true,
        currentRole: true,
        university: true,
        interests: { select: { interestId: true } },
        photos: { select: { id: true } },
        blocksCreated: { select: { blockedId: true } },
        blockedBy: { select: { blockerId: true } },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (users.length === 0) break;

    for (const user of users) {
      const batchLimit = user.isPremium
        ? LIMITS.PREMIUM_DAILY_MATCHES
        : LIMITS.FREE_DAILY_MATCHES;

      const candidates = await fetchCandidates(prisma, user, today);
      totalCandidates += candidates.length;

      const userForScoring: UserForScoring = {
        id: user.id,
        eloScore: user.eloScore,
        lastActiveAt: user.lastActiveAt,
        interests: user.interests.map((i: { interestId: string }) => i.interestId),
        currentRole: user.currentRole,
        university: user.university,
        bio: user.bio,
        photoCount: user.photos.length,
        verified: user.verified,
        isPremium: user.isPremium,
      };

      const ranked = rankCandidates(userForScoring, candidates, batchLimit);
      const profileIds = ranked.map((r) => r.userId);

      await prisma.dailyBatch.upsert({
        where: { userId_date: { userId: user.id, date: today } },
        create: {
          userId: user.id,
          profiles: profileIds,
          date: today,
        },
        update: {
          profiles: profileIds,
        },
      });
    }

    usersProcessed += users.length;
    cursor = users[users.length - 1].id;

    if (users.length < BATCH_SIZE) break;
  }

  const durationMs = Date.now() - start;
  const avgCandidates =
    usersProcessed > 0 ? Math.round(totalCandidates / usersProcessed) : 0;

  console.log(
    `[daily-batch] done: ${usersProcessed} users, avg ${avgCandidates} candidates, ${durationMs}ms`,
  );

  return { usersProcessed, avgCandidates, durationMs };
}

// ───── internal helpers ─────

async function fetchCandidates(
  prisma: PrismaClient,
  user: {
    id: string;
    city: string;
    gender: string;
    genderPref: string | null;
    birthDate: Date;
    minAge: number;
    maxAge: number;
    blocksCreated: { blockedId: string }[];
    blockedBy: { blockerId: string }[];
  },
  today: Date,
): Promise<UserForScoring[]> {
  // Build exclusion set: self + already liked/passed + blocked (both directions)
  const likedOrPassed = await prisma.like.findMany({
    where: { senderId: user.id },
    select: { receiverId: true },
  });

  const activeIntros = await prisma.intro.findMany({
    where: {
      OR: [{ senderId: user.id }, { receiverId: user.id }],
      status: { in: ['PENDING', 'ANSWERED'] },
    },
    select: { senderId: true, receiverId: true },
  });

  const excludeIds = new Set<string>([user.id]);
  for (const l of likedOrPassed) excludeIds.add(l.receiverId);
  for (const b of user.blocksCreated) excludeIds.add(b.blockedId);
  for (const b of user.blockedBy) excludeIds.add(b.blockerId);
  for (const i of activeIntros) {
    excludeIds.add(i.senderId);
    excludeIds.add(i.receiverId);
  }
  // Re-add self just in case it was removed by the intro loop
  excludeIds.add(user.id);

  // Age range → birthDate range
  const now = new Date();
  const maxBirthDate = new Date(
    now.getFullYear() - user.minAge,
    now.getMonth(),
    now.getDate(),
  );
  const minBirthDate = new Date(
    now.getFullYear() - user.maxAge - 1,
    now.getMonth(),
    now.getDate(),
  );

  const raw = await prisma.user.findMany({
    where: {
      id: { notIn: [...excludeIds] },
      city: user.city,
      status: 'ACTIVE',
      profileComplete: true,
      birthDate: { gte: minBirthDate, lte: maxBirthDate },
      ...(user.genderPref ? { gender: user.genderPref as 'MALE' | 'FEMALE' } : {}),
    },
    select: {
      id: true,
      eloScore: true,
      lastActiveAt: true,
      currentRole: true,
      university: true,
      bio: true,
      verified: true,
      isPremium: true,
      interests: { select: { interestId: true } },
      photos: { select: { id: true } },
    },
  });

  return raw.map(
    (c: {
      id: string;
      eloScore: number;
      lastActiveAt: Date;
      currentRole: string | null;
      university: string | null;
      bio: string | null;
      verified: boolean;
      isPremium: boolean;
      interests: { interestId: string }[];
      photos: { id: string }[];
    }): UserForScoring => ({
      id: c.id,
      eloScore: c.eloScore,
      lastActiveAt: c.lastActiveAt,
      interests: c.interests.map((i) => i.interestId),
      currentRole: c.currentRole,
      university: c.university,
      bio: c.bio,
      photoCount: c.photos.length,
      verified: c.verified,
      isPremium: c.isPremium,
    }),
  );
}

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}
