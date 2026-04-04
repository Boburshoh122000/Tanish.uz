import { PrismaClient } from '@prisma/client';
import { queueReEngagement } from '@tanish/shared/queue';
import { getRedis } from '../services/redis.js';

const RE_ENGAGEMENT_MESSAGES = {
  day3: {
    en: 'Your matches are waiting! See who\'s interested in you 🔍',
    ru: 'Ваши совпадения ждут! Посмотрите, кто вами заинтересовался 🔍',
    uz: 'Tanishlaringiz kutmoqda! Kim qiziqayotganini ko\'ring 🔍',
  },
  day7: {
    en: (count: number) => `You have ${count} unread intros. Come back and connect! 💬`,
    ru: (count: number) => `У вас ${count} непрочитанных интро. Вернитесь и начните общаться! 💬`,
    uz: (count: number) => `Sizda ${count} ta o'qilmagan tanishuv bor. Qaytib keling! 💬`,
  },
  day14: {
    en: 'We miss you! Your profile is getting less visible. Open Tanish to stay in the game.',
    ru: 'Мы скучаем! Ваш профиль становится менее заметным. Откройте Tanish.',
    uz: 'Siz sog\'indingiz! Profilingiz kamroq ko\'rinmoqda. Tanish\'ni oching.',
  },
  day30: {
    en: 'It\'s been a while! Your profile will be hidden from discovery soon. Tap to stay active.',
    ru: 'Давно не виделись! Ваш профиль скоро скроется из подборок. Зайдите, чтобы остаться.',
    uz: 'Anchadan beri ko\'rinmadingiz! Profilingiz tez orada yashirinadi. Faol qoling.',
  },
} as const;

function getLang(language: string): 'en' | 'ru' | 'uz' {
  if (language === 'ENGLISH' || language === 'en') return 'en';
  if (language === 'UZBEK' || language === 'uz') return 'uz';
  return 'ru';
}

const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Re-engagement cron. Runs daily at 06:00 UTC (11:00 Tashkent).
 *
 * - Day 3: "Your matches are waiting"
 * - Day 7: "You have N unread intros"
 * - Day 14: "Your profile is getting less visible"
 * - Day 30: Last message, then stop
 *
 * Dedup via Redis SET with 7-day TTL (no Event table queries).
 */
export async function processReEngagement(
  prisma: PrismaClient,
): Promise<{ notified: number }> {
  const now = new Date();
  let notified = 0;

  const ranges = [
    { minDays: 3, maxDays: 4, key: 'day3' as const },
    { minDays: 7, maxDays: 8, key: 'day7' as const },
    { minDays: 14, maxDays: 15, key: 'day14' as const },
    { minDays: 30, maxDays: 31, key: 'day30' as const },
  ];

  let redis: ReturnType<typeof getRedis> | null = null;
  try {
    redis = getRedis();
  } catch {
    console.warn('[re-engagement] Redis unavailable, skipping');
    return { notified: 0 };
  }

  for (const range of ranges) {
    const from = new Date(now.getTime() - range.maxDays * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() - range.minDays * 24 * 60 * 60 * 1000);

    const inactiveUsers = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        profileComplete: true,
        notifyReEngagement: true,
        lastActiveAt: { gte: from, lt: to },
      },
      select: {
        id: true,
        telegramId: true,
        preferredLanguage: true,
        _count: {
          select: {
            receivedIntros: {
              where: { status: 'PENDING' },
            },
          },
        },
      },
      take: 200,
    });

    for (const user of inactiveUsers) {
      try {
        // Dedup via Redis SET with 7-day TTL
        const dedupKey = `re_engagement:${user.id}:${range.key}`;
        const alreadySent = await redis.get(dedupKey);
        if (alreadySent) continue;

        const lang = getLang(user.preferredLanguage || 'RUSSIAN');
        let message: string;
        if (range.key === 'day7') {
          const pendingCount = user._count.receivedIntros;
          message = pendingCount > 0
            ? RE_ENGAGEMENT_MESSAGES.day7[lang](pendingCount)
            : RE_ENGAGEMENT_MESSAGES.day3[lang];
        } else {
          message = RE_ENGAGEMENT_MESSAGES[range.key][lang];
        }

        await queueReEngagement({
          telegramId: user.telegramId,
          text: message,
        });

        // Set dedup key with 7-day TTL
        await redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS);

        notified++;
      } catch (err) {
        console.error(`Re-engagement failed for user ${user.id}:`, err);
      }
    }
  }

  if (notified > 0) {
    console.log(`📬 Re-engagement: ${notified} users notified`);
  }

  return { notified };
}
