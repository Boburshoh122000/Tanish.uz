import { Queue } from 'bullmq';
import {
  NOTIFICATION_QUEUE_NAME,
  NotificationJobType,
  type IntroNotificationData,
  type MatchNotificationData,
  type DailyBatchNotificationData,
  type ExpiryWarningData,
  type WeeklySparkData,
  type ReEngagementData,
  type PremiumExpiredData,
  type NotificationJobData,
} from './notification-types.js';

// ===== Queue singleton =====

let _queue: Queue<NotificationJobData> | null = null;

export function getNotificationQueue(redisUrl?: string): Queue<NotificationJobData> {
  if (!_queue) {
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    const parsed = new URL(url);
    _queue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
      connection: {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined,
        username: parsed.username || undefined,
        maxRetriesPerRequest: null as unknown as number,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _queue;
}

// ===== Typed helper functions =====

export async function queueIntroNotification(params: {
  receiverTelegramId: bigint;
  senderName: string;
  introPreview: string;
  language: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: IntroNotificationData = {
    type: NotificationJobType.NEW_INTRO,
    receiverTelegramId: params.receiverTelegramId.toString(),
    senderName: params.senderName,
    introPreview: params.introPreview,
    language: params.language,
  };
  await queue.add(NotificationJobType.NEW_INTRO, data);
}

export async function queueMatchNotification(params: {
  telegramId: bigint;
  matchName: string;
  matchUsername: string | null;
  matchProfileId: string;
  language: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: MatchNotificationData = {
    type: NotificationJobType.MATCH,
    telegramId: params.telegramId.toString(),
    matchName: params.matchName,
    matchUsername: params.matchUsername,
    matchProfileId: params.matchProfileId,
    language: params.language,
  };
  await queue.add(NotificationJobType.MATCH, data);
}

export async function queueDailyBatchNotification(params: {
  telegramId: bigint;
  matchCount: number;
  language: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: DailyBatchNotificationData = {
    type: NotificationJobType.DAILY_BATCH,
    telegramId: params.telegramId.toString(),
    matchCount: params.matchCount,
    language: params.language,
  };
  await queue.add(NotificationJobType.DAILY_BATCH, data);
}

export async function queueExpiryWarning(params: {
  telegramId: bigint;
  senderName: string;
  language: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: ExpiryWarningData = {
    type: NotificationJobType.EXPIRY_WARNING,
    telegramId: params.telegramId.toString(),
    senderName: params.senderName,
    language: params.language,
  };
  await queue.add(NotificationJobType.EXPIRY_WARNING, data);
}

export async function queueWeeklySpark(params: {
  telegramId: bigint;
  text: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: WeeklySparkData = {
    type: NotificationJobType.WEEKLY_SPARK,
    telegramId: params.telegramId.toString(),
    text: params.text,
  };
  await queue.add(NotificationJobType.WEEKLY_SPARK, data);
}

export async function queueReEngagement(params: {
  telegramId: bigint;
  text: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: ReEngagementData = {
    type: NotificationJobType.RE_ENGAGEMENT,
    telegramId: params.telegramId.toString(),
    text: params.text,
  };
  await queue.add(NotificationJobType.RE_ENGAGEMENT, data);
}

export async function queuePremiumExpired(params: {
  telegramId: bigint;
  language: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: PremiumExpiredData = {
    type: NotificationJobType.PREMIUM_EXPIRED,
    telegramId: params.telegramId.toString(),
    language: params.language,
  };
  await queue.add(NotificationJobType.PREMIUM_EXPIRED, data);
}
