import { PrismaClient } from '@prisma/client';
import { EVENT_TYPES } from '@tanish/shared';

/**
 * Daily metrics rollup. Runs at 02:00 UTC (07:00 Tashkent).
 * Computes yesterday's metrics and stores in DailyMetrics table.
 *
 * Changes from previous version:
 * - Uses EVENT_TYPES constants (no hardcoded strings)
 * - Filters out isTestUser from all counts
 * - Fixed orphans: onboarding_start → onboarding_started, chat_opened now live
 */
export async function computeDailyMetrics(prisma: PrismaClient): Promise<void> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);

  const today = new Date(yesterday);
  today.setUTCDate(today.getUTCDate() + 1);

  const existing = await prisma.dailyMetrics.findUnique({
    where: { date: yesterday },
  });
  if (existing) {
    console.log(`📊 Metrics for ${yesterday.toISOString().slice(0, 10)} already computed`);
    return;
  }

  const dateFilter = { gte: yesterday, lt: today };

  // Get test user IDs to exclude
  const testUsers = await prisma.user.findMany({
    where: { isTestUser: true },
    select: { id: true },
  });
  const testUserIds = testUsers.map((u) => u.id);

  // Shared where clause for event queries
  const eventWhere = (type: string) => ({
    type,
    createdAt: dateFilter,
    ...(testUserIds.length > 0 ? { userId: { notIn: testUserIds } } : {}),
  });

  const [
    dauGroups,
    newSignups,
    onboardingStarts,
    onboardingCompletes,
    introsSent,
    introsAnswered,
    introsDeclined,
    introsExpired,
    matchesCreated,
    chatsOpened,
    premiumViews,
    premiumPurchases,
    genderCounts,
    avgEloResult,
    revenueResult,
  ] = await Promise.all([
    // DAU: unique users with app_open event
    prisma.event.groupBy({
      by: ['userId'],
      where: eventWhere(EVENT_TYPES.APP_OPEN),
    }),

    prisma.event.count({ where: eventWhere(EVENT_TYPES.ONBOARDING_COMPLETE) }),
    prisma.event.count({ where: eventWhere(EVENT_TYPES.ONBOARDING_STARTED) }),
    prisma.event.count({ where: eventWhere(EVENT_TYPES.ONBOARDING_COMPLETE) }),
    prisma.event.count({ where: eventWhere(EVENT_TYPES.INTRO_SENT) }),
    prisma.event.count({ where: eventWhere(EVENT_TYPES.INTRO_ANSWERED) }),
    prisma.event.count({ where: eventWhere(EVENT_TYPES.INTRO_DECLINED) }),
    prisma.event.count({ where: eventWhere(EVENT_TYPES.INTRO_EXPIRED) }),

    // match_created fires for both users — divide by 2
    prisma.event.count({ where: eventWhere(EVENT_TYPES.MATCH_CREATED) }),

    prisma.event.count({ where: eventWhere(EVENT_TYPES.CHAT_OPENED) }),
    prisma.event.count({ where: eventWhere(EVENT_TYPES.PREMIUM_VIEWED) }),
    prisma.event.count({ where: eventWhere(EVENT_TYPES.PREMIUM_PURCHASED) }),

    // Active gender counts
    prisma.user.groupBy({
      by: ['gender'],
      where: {
        status: 'ACTIVE',
        profileComplete: true,
        isTestUser: false,
        lastActiveAt: dateFilter,
      },
      _count: true,
    }),

    // Average ELO
    prisma.user.aggregate({
      where: { status: 'ACTIVE', profileComplete: true, isTestUser: false },
      _avg: { eloScore: true },
    }),

    // Revenue
    prisma.payment.aggregate({
      where: { createdAt: dateFilter },
      _sum: { amount: true },
    }),
  ]);

  const activeMales = genderCounts.find((g) => g.gender === 'MALE')?._count ?? 0;
  const activeFemales = genderCounts.find((g) => g.gender === 'FEMALE')?._count ?? 0;

  await prisma.dailyMetrics.create({
    data: {
      date: yesterday,
      dau: dauGroups.length,
      newSignups,
      onboardingStarts,
      onboardingCompletes,
      introsSent,
      introsAnswered,
      introsDeclined,
      introsExpired,
      matchesCreated: Math.floor(matchesCreated / 2),
      chatsOpened,
      premiumViews,
      premiumPurchases,
      activeMales,
      activeFemales,
      avgElo: avgEloResult._avg.eloScore ?? 1000,
      revenue: revenueResult._sum.amount ?? 0,
    },
  });

  console.log(
    `📊 Metrics for ${yesterday.toISOString().slice(0, 10)}: ` +
      `DAU=${dauGroups.length}, signups=${newSignups}, intros=${introsSent}, ` +
      `matches=${Math.floor(matchesCreated / 2)}, chats=${chatsOpened}, ` +
      `M:F=${activeMales}:${activeFemales}`,
  );
}
