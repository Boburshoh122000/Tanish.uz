import { PrismaClient } from '@prisma/client';

/**
 * Daily metrics rollup. Runs at 02:00 UTC (07:00 Tashkent).
 * Computes yesterday's metrics and stores in DailyMetrics table.
 */
export async function computeDailyMetrics(prisma: PrismaClient): Promise<void> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);

  const today = new Date(yesterday);
  today.setUTCDate(today.getUTCDate() + 1);

  // Check if already computed
  const existing = await prisma.dailyMetrics.findUnique({
    where: { date: yesterday },
  });
  if (existing) {
    console.log(`📊 Metrics for ${yesterday.toISOString().slice(0, 10)} already computed`);
    return;
  }

  const dateFilter = { gte: yesterday, lt: today };

  // Compute all metrics in parallel
  const [
    dauResult,
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
    revenue,
  ] = await Promise.all([
    // DAU: unique users with app_open event
    prisma.event.groupBy({
      by: ['userId'],
      where: { type: 'app_open', createdAt: dateFilter },
    }).then((r) => r.length),

    // New signups
    prisma.event.count({
      where: { type: 'onboarding_complete', createdAt: dateFilter },
    }),

    // Onboarding starts
    prisma.event.count({
      where: { type: 'onboarding_start', createdAt: dateFilter },
    }),

    // Onboarding completes
    prisma.event.count({
      where: { type: 'onboarding_complete', createdAt: dateFilter },
    }),

    // Intros sent
    prisma.event.count({
      where: { type: 'intro_sent', createdAt: dateFilter },
    }),

    // Intros answered
    prisma.event.count({
      where: { type: 'intro_answered', createdAt: dateFilter },
    }),

    // Intros declined
    prisma.event.count({
      where: { type: 'intro_declined', createdAt: dateFilter },
    }),

    // Intros expired
    prisma.event.count({
      where: { type: 'intro_expired', createdAt: dateFilter },
    }),

    // Matches created (divide by 2 since both users get an event)
    prisma.event.count({
      where: { type: 'match_created', createdAt: dateFilter },
    }).then((c) => Math.floor(c / 2)),

    // Chats opened
    prisma.event.count({
      where: { type: 'chat_opened', createdAt: dateFilter },
    }),

    // Premium views
    prisma.event.count({
      where: { type: 'premium_viewed', createdAt: dateFilter },
    }),

    // Premium purchases
    prisma.event.count({
      where: { type: 'premium_purchased', createdAt: dateFilter },
    }),

    // Active gender counts
    prisma.user.groupBy({
      by: ['gender'],
      where: {
        status: 'ACTIVE',
        profileComplete: true,
        lastActiveAt: dateFilter,
      },
      _count: true,
    }),

    // Average ELO
    prisma.user.aggregate({
      where: { status: 'ACTIVE', profileComplete: true },
      _avg: { eloScore: true },
    }),

    // Revenue (sum of payments in Stars)
    prisma.payment.aggregate({
      where: { createdAt: dateFilter },
      _sum: { amount: true },
    }),
  ]);

  const activeMales = genderCounts.find((g) => g.gender === 'MALE')?._count || 0;
  const activeFemales = genderCounts.find((g) => g.gender === 'FEMALE')?._count || 0;

  await prisma.dailyMetrics.create({
    data: {
      date: yesterday,
      dau: dauResult,
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
      activeMales,
      activeFemales,
      avgElo: avgEloResult._avg.eloScore || 1000,
      revenue: revenue._sum.amount || 0,
    },
  });

  console.log(`📊 Daily metrics computed for ${yesterday.toISOString().slice(0, 10)}: DAU=${dauResult}, signups=${newSignups}, matches=${matchesCreated}`);
}
