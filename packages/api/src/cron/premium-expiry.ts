import { PrismaClient } from '@prisma/client';
import type { NotificationService } from '../services/notification.service.js';

/**
 * Check and expire premium subscriptions.
 * Runs daily.
 */
export async function processPremiumExpiry(
  prisma: PrismaClient,
  notificationService: NotificationService | null,
  webAppUrl: string
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

  // Notify each user
  if (notificationService) {
    for (const user of expiredUsers) {
      try {
        await notificationService.send({
          type: 'premium_expired',
          telegramId: Number(user.telegramId),
          userId: user.id,
          text: '⭐ Your Tanish Premium has expired.\n\nYou\'re back to 3 daily matches. Upgrade again to keep the benefits!',
          buttons: [{ text: '⭐ Renew Premium', webApp: `${webAppUrl}?page=premium` }],
        });
      } catch (err) {
        console.error(`Premium expiry notification failed for ${user.id}:`, err);
      }
    }
  }

  // Track events
  await prisma.event.createMany({
    data: expiredUsers.map((u) => ({
      userId: u.id,
      type: 'premium_expired',
    })),
  });

  console.log(`⭐ Premium expiry: ${expiredUsers.length} subscriptions expired`);
  return { expired: expiredUsers.length };
}
