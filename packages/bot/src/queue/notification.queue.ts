import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { type Bot } from 'grammy';
import { NotificationType } from '@tanish/shared';
import { NotificationService } from '../services/notification.service.js';

// ===== Job Data Types =====

export interface IntroNotificationData {
  type: typeof NotificationType.NEW_INTRO;
  receiverTelegramId: string; // bigint serialized as string
  senderName: string;
  introPreview: string;
  language: string;
}

export interface MatchNotificationData {
  type: typeof NotificationType.MATCH;
  telegramId: string;
  matchName: string;
  matchUsername: string | null;
  matchProfileId: string;
  language: string;
}

export interface DailyBatchNotificationData {
  type: typeof NotificationType.DAILY_BATCH;
  telegramId: string;
  matchCount: number;
  language: string;
}

export interface ExpiryWarningData {
  type: typeof NotificationType.EXPIRY_WARNING;
  telegramId: string;
  senderName: string;
  language: string;
}

export interface WeeklySparkData {
  type: typeof NotificationType.WEEKLY_SPARK;
  telegramId: string;
  text: string;
}

export interface ReEngagementData {
  type: typeof NotificationType.RE_ENGAGEMENT;
  telegramId: string;
  text: string;
}

export type NotificationJobData =
  | IntroNotificationData
  | MatchNotificationData
  | DailyBatchNotificationData
  | ExpiryWarningData
  | WeeklySparkData
  | ReEngagementData;

// ===== Constants =====

// MUST match the queue name in @tanish/shared/queue/notification-types.ts
export const QUEUE_NAME = 'tanish:notifications';
const COOLDOWN_TTL_SECONDS = 120; // 2 min cooldown per user

// ===== Redis Connection =====

function getConnectionOpts() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    maxRetriesPerRequest: null as unknown as number, // BullMQ requirement
  };
}

// ===== Queue (importable from any package) =====

let _queue: Queue | null = null;

export function getNotificationQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: getConnectionOpts(),
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

// ===== Worker (only started in the bot process) =====

export function startNotificationWorker(bot: Bot): Worker {
  const webappUrl = process.env.WEBAPP_URL || 'https://tanish.uz';
  const service = new NotificationService(bot);
  const connOpts = getConnectionOpts();

  // Dedicated Redis client for cooldown checks
  const redis = new Redis({
    host: connOpts.host,
    port: connOpts.port,
    password: connOpts.password,
    username: connOpts.username,
    lazyConnect: true,
  });
  redis.connect().catch((err) => console.error('[notify-worker] Redis connect error:', err));

  const worker = new Worker<NotificationJobData>(
    QUEUE_NAME,
    async (job: Job<NotificationJobData>) => {
      const data = job.data;
      const telegramId = 'receiverTelegramId' in data
        ? data.receiverTelegramId
        : data.telegramId;

      // ── Cooldown check ──
      const cooldownKey = `notify:cooldown:${telegramId}`;
      const exists = await redis.exists(cooldownKey);
      if (exists) {
        console.log(`[notify-worker] Cooldown active for ${telegramId}, skipping ${data.type}`);
        return;
      }

      // ── Quiet hours check ──
      const delay = NotificationService.getQuietHoursDelay();
      if (delay > 0) {
        // Re-enqueue with delay instead of processing now
        const queue = getNotificationQueue();
        await queue.add(data.type, data, { delay });
        console.log(`[notify-worker] Quiet hours — re-queued ${data.type} for ${telegramId} with ${Math.round(delay / 60_000)}min delay`);
        return;
      }

      // ── Dispatch by type ──
      const tgId = BigInt(telegramId);

      switch (data.type) {
        case 'NEW_INTRO': {
          const d = data as IntroNotificationData;
          await service.sendIntroNotification(tgId, d.senderName, d.introPreview, d.language as 'UZBEK' | 'RUSSIAN' | 'ENGLISH', webappUrl);
          break;
        }
        case 'MATCH': {
          const d = data as MatchNotificationData;
          await service.sendMatchNotification(tgId, d.matchName, d.matchUsername, d.matchProfileId, d.language as 'UZBEK' | 'RUSSIAN' | 'ENGLISH', webappUrl);
          break;
        }
        case 'DAILY_BATCH': {
          const d = data as DailyBatchNotificationData;
          await service.sendDailyBatchNotification(tgId, d.matchCount, d.language as 'UZBEK' | 'RUSSIAN' | 'ENGLISH', webappUrl);
          break;
        }
        case 'EXPIRY_WARNING': {
          const d = data as ExpiryWarningData;
          await service.sendExpiryWarning(tgId, d.senderName, d.language as 'UZBEK' | 'RUSSIAN' | 'ENGLISH', webappUrl);
          break;
        }
        case 'WEEKLY_SPARK':
        case 'RE_ENGAGEMENT': {
          const d = data as WeeklySparkData | ReEngagementData;
          await service.sendNotification(tgId, d.text);
          break;
        }
      }

      // ── Set cooldown ──
      await redis.set(cooldownKey, '1', 'EX', COOLDOWN_TTL_SECONDS);
    },
    {
      connection: connOpts,
      concurrency: 5,
      limiter: {
        max: 25,       // Stay under Telegram's 30/sec limit
        duration: 1000,
      },
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[notify-worker] Job ${job?.id} failed [${job?.data.type}]:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[notify-worker] Worker error:', err.message);
  });

  console.log('✅ Notification worker started');
  return worker;
}
