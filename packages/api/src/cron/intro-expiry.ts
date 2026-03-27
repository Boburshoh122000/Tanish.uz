import { PrismaClient } from '@prisma/client';
import { LIMITS, EVENT_TYPES } from '@tanish/shared';
import { queueExpiryWarning } from '@tanish/shared/queue';
import type { EloService } from '../services/elo.service.js';
import type { TrackingService } from '../services/tracking.service.js';

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
  webAppUrl: string,
  tracker?: TrackingService,
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
        tracker?.trackMany([
          { type: EVENT_TYPES.INTRO_EXPIRED, userId: intro.senderId, metadata: { introId: intro.id } },
          { type: EVENT_TYPES.INTRO_EXPIRED, userId: intro.receiverId, metadata: { introId: intro.id } },
        ]);

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

  for (const intro of expiringIntros) {
    try {
      await queueExpiryWarning({
        telegramId: intro.receiver.telegramId,
        senderName: intro.sender.firstName,
        language: 'RUSSIAN',
      });
      warned++;
    } catch (err) {
      console.error(`Failed to queue expiry warning for intro ${intro.id}:`, err);
    }
  }

  if (expired > 0 || warned > 0) {
    console.log(`🔄 Intro expiry: ${expired} expired, ${warned} warnings sent`);
  }

  return { expired, warned };
}
