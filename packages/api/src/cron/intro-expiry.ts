import { PrismaClient } from '@prisma/client';
import { LIMITS } from '@tanish/shared';
import type { NotificationService } from '../services/notification.service.js';
import type { EloService } from '../services/elo.service.js';

/**
 * Process intro expirations. Runs every hour.
 * 
 * 1. Expire intros past their expiresAt
 * 2. Send 4-hour warning for intros about to expire
 * 3. Apply ELO penalties for expired intros
 */
export async function processIntroExpiry(
  prisma: PrismaClient,
  eloService: EloService,
  notificationService: NotificationService | null,
  webAppUrl: string
): Promise<{ expired: number; warned: number }> {
  const now = new Date();
  let expired = 0;
  let warned = 0;

  // 1. Expire past-due intros
  const expiredIntros = await prisma.intro.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      senderId: true,
      receiverId: true,
    },
  });

  if (expiredIntros.length > 0) {
    // Batch update status
    await prisma.intro.updateMany({
      where: {
        id: { in: expiredIntros.map((i) => i.id) },
      },
      data: { status: 'EXPIRED' },
    });

    // Apply ELO penalties and log events
    for (const intro of expiredIntros) {
      try {
        // Receiver gets ELO penalty for not responding
        await eloService.adjustScore(
          intro.receiverId,
          'intro_expired_no_response',
          LIMITS.ELO_INTRO_EXPIRED
        );

        // Track events
        await prisma.event.createMany({
          data: [
            { userId: intro.senderId, type: 'intro_expired', metadata: { introId: intro.id } },
            { userId: intro.receiverId, type: 'intro_expired', metadata: { introId: intro.id } },
          ],
        });

        expired++;
      } catch (err) {
        console.error(`Failed to process expired intro ${intro.id}:`, err);
      }
    }
  }

  // 2. Send warnings for intros expiring in ~4 hours
  const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const expiringIntros = await prisma.intro.findMany({
    where: {
      status: 'PENDING',
      expiresAt: {
        gte: threeHoursFromNow,
        lt: fourHoursFromNow,
      },
    },
    select: {
      id: true,
      receiverId: true,
      sender: {
        select: {
          firstName: true,
        },
      },
      receiver: {
        select: {
          id: true,
          telegramId: true,
        },
      },
    },
  });

  if (notificationService) {
    for (const intro of expiringIntros) {
      try {
        await notificationService.notifyExpiryWarning(
          intro.receiver.id,
          Number(intro.receiver.telegramId),
          intro.sender.firstName,
          webAppUrl
        );
        warned++;
      } catch (err) {
        console.error(`Failed to send expiry warning for intro ${intro.id}:`, err);
      }
    }
  }

  if (expired > 0 || warned > 0) {
    console.log(`🔄 Intro expiry: ${expired} expired, ${warned} warnings sent`);
  }

  return { expired, warned };
}
