import { PrismaClient } from '@prisma/client';
import { EVENT_TYPES, queuePremiumExpired } from '@tanish/shared';
import type { TrackingService } from '../services/tracking.service.js';

/**
 * Check and expire premium subscriptions.
 * Runs daily.
 */
export async function processPremiumExpiry(
  prisma: PrismaClient,
  webAppUrl: string,
  tracker?: TrackingService,
): Promise<{ expired: number }> {
  const now = new Date();

  const expiredUsers = await prisma.user.findMany({
    where: {
      isPremium: true,
      premiumUntil: { lt: now },
    },
    select: {
      id: true,
      telegramId: true,
      preferredLanguage: true,
    },
  });

  if (expiredUsers.length === 0) return { expired: 0 };

  // Batch update
  await prisma.user.updateMany({
    where: {
      id: { in: expiredUsers.map((u) => u.id) },
    },
    data: { isPremium: false },
  });

  // Notify each user via consolidated queue
  for (const user of expiredUsers) {
    try {
      await queuePremiumExpired({
        telegramId: user.telegramId,
        language: user.preferredLanguage || 'RUSSIAN',
      });
    } catch (err) {
      console.error(`Premium expiry notification failed for ${user.id}:`, err);
    }
  }

  // Track events
  if (tracker) {
    tracker.trackMany(
      expiredUsers.map((u) => ({ type: EVENT_TYPES.PREMIUM_EXPIRED, userId: u.id, metadata: {} })),
    );
  }

  console.log(`⭐ Premium expiry: ${expiredUsers.length} subscriptions expired`);
  return { expired: expiredUsers.length };
}
