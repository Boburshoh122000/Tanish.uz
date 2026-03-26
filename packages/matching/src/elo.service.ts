import type { PrismaClient } from '@prisma/client';
import { LIMITS, EloEvent } from '@tanish/shared';

/**
 * Point deltas for each ELO event.
 * Positive = score goes up, negative = score goes down.
 */
const ELO_DELTAS: Record<EloEvent, number> = {
  [EloEvent.INTRO_RECEIVED]: LIMITS.ELO_INTRO_RECEIVED,       // +5
  [EloEvent.MATCH_CREATED]: LIMITS.ELO_MATCH_CREATED,         // +10
  [EloEvent.PROFILE_VERIFIED]: LIMITS.ELO_PROFILE_VERIFIED,   // +50
  [EloEvent.PROFILE_COMPLETE]: LIMITS.ELO_PROFILE_COMPLETE,   // +30
  [EloEvent.DAILY_ACTIVE]: LIMITS.ELO_DAILY_ACTIVE,           // +2
  [EloEvent.INTRO_EXPIRED]: LIMITS.ELO_INTRO_EXPIRED,         // -8
  [EloEvent.REPORTED]: LIMITS.ELO_REPORTED,                   // -20
  [EloEvent.INACTIVE_DECAY]: LIMITS.ELO_INACTIVE_DAILY,       // -5  (used as default; extended handled separately)
  [EloEvent.INTRO_DECLINED]: LIMITS.ELO_INTRO_DECLINED,       // -3
};

/**
 * Adjust a user's ELO score by a fixed event delta.
 * Clamps to [ELO_MIN, ELO_MAX] and logs an Event row.
 */
export async function adjustScore(
  prisma: PrismaClient,
  userId: string,
  event: EloEvent,
  pointsOverride?: number,
): Promise<number> {
  const delta = pointsOverride ?? ELO_DELTAS[event];

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { eloScore: true },
  });

  const newScore = clampElo(user.eloScore + delta);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { eloScore: newScore },
    }),
    prisma.event.create({
      data: {
        userId,
        type: `elo_${event.toLowerCase()}`,
        metadata: {
          previousScore: user.eloScore,
          delta,
          newScore,
          event,
        },
      },
    }),
  ]);

  return newScore;
}

/**
 * Decay ELO for inactive users.
 *
 * - 3–13 days inactive: −5/day
 * - 14+ days inactive:  −10/day
 * - Floor: ELO_MIN (200)
 *
 * Processes all inactive users in a single pass.
 * Returns the number of users affected.
 */
export async function decayInactiveUsers(
  prisma: PrismaClient,
): Promise<number> {
  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);

  // Fetch all users inactive 3+ days whose ELO is above floor
  const inactiveUsers = await prisma.user.findMany({
    where: {
      lastActiveAt: { lt: threeDaysAgo },
      status: 'ACTIVE',
      eloScore: { gt: LIMITS.ELO_MIN },
    },
    select: {
      id: true,
      eloScore: true,
      lastActiveAt: true,
    },
  });

  let affected = 0;

  for (const user of inactiveUsers) {
    const inactiveDays = Math.floor(
      (now - user.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Skip users inactive < 3 days (shouldn't happen given the query, but guard)
    if (inactiveDays < 3) continue;

    const dailyPenalty =
      inactiveDays >= 14
        ? LIMITS.ELO_INACTIVE_EXTENDED   // -10/day
        : LIMITS.ELO_INACTIVE_DAILY;     // -5/day

    const newScore = clampElo(user.eloScore + dailyPenalty);

    // Skip if already at floor
    if (newScore === user.eloScore) continue;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { eloScore: newScore },
      }),
      prisma.event.create({
        data: {
          userId: user.id,
          type: `elo_${EloEvent.INACTIVE_DECAY.toLowerCase()}`,
          metadata: {
            previousScore: user.eloScore,
            delta: dailyPenalty,
            newScore,
            inactiveDays,
            event: EloEvent.INACTIVE_DECAY,
          },
        },
      }),
    ]);

    affected++;
  }

  console.log(
    `[elo-decay] decayed ${affected} / ${inactiveUsers.length} inactive users`,
  );

  return affected;
}

// ───── helpers ─────

function clampElo(score: number): number {
  return Math.max(LIMITS.ELO_MIN, Math.min(LIMITS.ELO_MAX, score));
}
