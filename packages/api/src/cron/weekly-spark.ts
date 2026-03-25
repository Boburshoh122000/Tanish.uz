import { PrismaClient } from '@prisma/client';
import type { NotificationService } from '../services/notification.service.js';
import { weeklySparkMessage } from '../services/translate.js';

/**
 * Weekly spark questions — sent to matched pairs who haven't chatted in 3+ days.
 * Runs every Friday at 13:00 UTC (18:00 Tashkent).
 */

const SPARK_QUESTIONS = [
  // English — these are conversation starters, not icebreakers
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
  notificationService: NotificationService | null,
  webAppUrl: string
): Promise<{ sent: number }> {
  if (!notificationService) return { sent: 0 };

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  let sent = 0;

  // Find matched pairs where at least one hasn't opened the chat recently
  const matches = await prisma.intro.findMany({
    where: {
      status: 'MATCHED',
      chatUnlocked: true,
      createdAt: { lt: threeDaysAgo }, // Matched at least 3 days ago
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
    take: 200, // Cap per run
  });

  // Filter to pairs where neither has had a chat_opened event recently
  for (const match of matches) {
    try {
      // Check if we already sent a spark for this pair this week
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const alreadySent = await prisma.event.findFirst({
        where: {
          type: 'weekly_spark',
          userId: match.senderId,
          metadata: {
            path: ['matchId'],
            equals: match.id,
          },
          createdAt: { gte: weekAgo },
        },
      });

      if (alreadySent) continue;

      // Pick a random question
      const question = SPARK_QUESTIONS[Math.floor(Math.random() * SPARK_QUESTIONS.length)]!;

      // Send to sender
      if (match.sender.notifyMatches) {
        const text = weeklySparkMessage(
          match.sender.preferredLanguage,
          match.receiver.firstName,
          question
        );
        await notificationService.send({
          type: 'weekly_spark',
          telegramId: Number(match.sender.telegramId),
          userId: match.sender.id,
          text,
          buttons: [
            {
              text: '💬 Open chat',
              url: `https://t.me/${match.receiver.firstName}`, // Fallback
            },
          ],
        });
      }

      // Send to receiver
      if (match.receiver.notifyMatches) {
        const text = weeklySparkMessage(
          match.receiver.preferredLanguage,
          match.sender.firstName,
          question
        );
        await notificationService.send({
          type: 'weekly_spark',
          telegramId: Number(match.receiver.telegramId),
          userId: match.receiver.id,
          text,
          buttons: [
            {
              text: '💬 Open chat',
              url: `https://t.me/${match.sender.firstName}`, // Fallback
            },
          ],
        });
      }

      // Log
      await prisma.event.createMany({
        data: [
          { userId: match.senderId, type: 'weekly_spark', metadata: { matchId: match.id } },
          { userId: match.receiverId, type: 'weekly_spark', metadata: { matchId: match.id } },
        ],
      });

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
