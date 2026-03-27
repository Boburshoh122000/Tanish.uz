import { PrismaClient } from '@prisma/client';
import { EVENT_TYPES } from '@tanish/shared';
import { queueWeeklySpark } from '@tanish/shared/queue';
import type { TrackingService } from '../services/tracking.service.js';
import { weeklySparkMessage } from '../services/translate.js';

/**
 * Weekly spark questions — sent to matched pairs who haven't chatted in 3+ days.
 * Runs every Friday at 13:00 UTC (18:00 Tashkent).
 */

const SPARK_QUESTIONS = [
  "What's been the highlight of your week?",
  "Discovered anything cool lately — a place, a show, a song?",
  "If you could swap jobs for a day with anyone, who would it be?",
  "What's the most underrated restaurant in Tashkent?",
  "What are you looking forward to this weekend?",
  "If you could travel anywhere next month, where?",
  "What's a skill you wish you had?",
  "What's the best advice someone gave you this year?",
  "Coffee or tea person — and what's your order?",
  "What's one thing on your bucket list?",
];

export async function processWeeklySpark(
  prisma: PrismaClient,
  tracker?: TrackingService,
): Promise<{ sent: number }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  let sent = 0;

  const matches = await prisma.intro.findMany({
    where: {
      status: 'MATCHED',
      chatUnlocked: true,
      createdAt: { lt: threeDaysAgo },
    },
    select: {
      id: true,
      senderId: true,
      receiverId: true,
      sender: {
        select: {
          id: true,
          telegramId: true,
          firstName: true,
          preferredLanguage: true,
          notifyMatches: true,
        },
      },
      receiver: {
        select: {
          id: true,
          telegramId: true,
          firstName: true,
          preferredLanguage: true,
          notifyMatches: true,
        },
      },
    },
    take: 200,
  });

  for (const match of matches) {
    try {
      // Check if we already sent a spark for this pair this week
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const alreadySent = await prisma.event.findFirst({
        where: {
          type: EVENT_TYPES.WEEKLY_SPARK,
          userId: match.senderId,
          metadata: {
            path: ['matchId'],
            equals: match.id,
          },
          createdAt: { gte: weekAgo },
        },
      });

      if (alreadySent) continue;

      const question = SPARK_QUESTIONS[Math.floor(Math.random() * SPARK_QUESTIONS.length)]!;

      // Queue notification for sender
      if (match.sender.notifyMatches) {
        const text = weeklySparkMessage(
          match.sender.preferredLanguage,
          match.receiver.firstName,
          question
        );
        await queueWeeklySpark({
          telegramId: match.sender.telegramId,
          text,
        });
      }

      // Queue notification for receiver
      if (match.receiver.notifyMatches) {
        const text = weeklySparkMessage(
          match.receiver.preferredLanguage,
          match.sender.firstName,
          question
        );
        await queueWeeklySpark({
          telegramId: match.receiver.telegramId,
          text,
        });
      }

      // Track events
      tracker?.trackMany([
        { type: EVENT_TYPES.WEEKLY_SPARK, userId: match.senderId, metadata: { matchId: match.id } },
        { type: EVENT_TYPES.WEEKLY_SPARK, userId: match.receiverId, metadata: { matchId: match.id } },
      ]);

      sent++;
    } catch (err) {
      console.error(`Weekly spark failed for match ${match.id}:`, err);
    }
  }

  if (sent > 0) {
    console.log(`💡 Weekly spark: ${sent} pairs nudged`);
  }

  return { sent };
}
