import { Queue, Worker, type Job } from 'bullmq';
import { Bot, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { QUIET_HOURS } from '@tanish/shared';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function getConnectionOpts() {
  const url = new URL(REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
    username: url.username || undefined,
  };
}

// ===== Types =====

interface NotificationJob {
  type: NotifType;
  telegramId: number;
  userId: string;
  text: string;
  buttons?: Array<{ text: string; url?: string; webApp?: string }>;
  language?: string;
}

type NotifType =
  | 'daily_batch'
  | 'new_intro'
  | 'match'
  | 'expiry_warning'
  | 'weekly_spark'
  | 're_engagement'
  | 'profile_tip'
  | 'premium_confirm'
  | 'premium_expired'
  | 'verification_result'
  | 'suspension';

// ===== Service =====

export class NotificationService {
  private queue: Queue;
  private worker: Worker | null = null;
  private bot: Bot;
  private prisma: PrismaClient;

  constructor(bot: Bot, prisma: PrismaClient) {
    this.bot = bot;
    this.prisma = prisma;

    this.queue = new Queue('notifications', {
      connection: getConnectionOpts(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    });
  }

  /**
   * Start the worker that processes notification jobs.
   */
  startWorker(): void {
    this.worker = new Worker<NotificationJob>(
      'notifications',
      async (job: Job<NotificationJob>) => {
        await this.processJob(job.data);
      },
      {
        connection: getConnectionOpts(),
        concurrency: 5,
        limiter: {
          max: 30,      // 30 messages per second (Telegram limit)
          duration: 1000,
        },
      }
    );

    this.worker.on('completed', (job) => {
      // Silent — don't log every notification
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Notification failed [${job?.data.type}] for user ${job?.data.userId}:`, err.message);
    });

    console.log('✅ Notification worker started');
  }

  /**
   * Send a notification (adds to queue, respects quiet hours).
   */
  async send(params: NotificationJob): Promise<void> {
    // Check user notification preferences
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        notifyDailyBatch: true,
        notifyIntros: true,
        notifyMatches: true,
        notifyReEngagement: true,
      },
    });

    if (user) {
      const prefMap: Record<string, boolean> = {
        daily_batch: user.notifyDailyBatch,
        new_intro: user.notifyIntros,
        expiry_warning: user.notifyIntros,
        match: user.notifyMatches,
        re_engagement: user.notifyReEngagement,
        weekly_spark: user.notifyMatches,
      };

      if (prefMap[params.type] === false) return; // User opted out
    }

    // Check quiet hours (23:00 - 08:00 Tashkent)
    const delay = this.getQuietHoursDelay();

    await this.queue.add(params.type, params, {
      delay,
      // Dedup: max 1 notification per user per 2 minutes
      jobId: `${params.userId}:${params.type}:${Math.floor(Date.now() / 120_000)}`,
    });
  }

  /**
   * Send immediately (bypasses queue, for safety-critical notifications).
   */
  async sendDirect(params: NotificationJob): Promise<boolean> {
    return this.processJob(params);
  }

  // ===== Convenience Methods =====

  async notifyDailyBatch(userId: string, telegramId: number, webAppUrl: string): Promise<void> {
    await this.send({
      type: 'daily_batch',
      telegramId,
      userId,
      text: '☀️ Good morning! Your matches for today are ready.\n\nTap below to see who you got!',
      buttons: [{ text: '🔍 See matches', webApp: webAppUrl }],
    });
  }

  async notifyNewIntro(
    receiverId: string,
    receiverTelegramId: number,
    senderName: string,
    answerPreview: string,
    webAppUrl: string
  ): Promise<void> {
    const preview = answerPreview.length > 80 ? answerPreview.slice(0, 77) + '...' : answerPreview;
    await this.send({
      type: 'new_intro',
      telegramId: receiverTelegramId,
      userId: receiverId,
      text: `💬 ${senderName} wants to connect with you!\n\nThey said: "${preview}"\n\nAnswer to unlock chat!`,
      buttons: [{ text: '💬 See intro', webApp: `${webAppUrl}?page=intros` }],
    });
  }

  async notifyMatch(
    userId: string,
    telegramId: number,
    otherName: string,
    otherUsername: string | null,
    webAppUrl: string
  ): Promise<void> {
    const buttons: NotificationJob['buttons'] = [
      { text: '👤 See profile', webApp: `${webAppUrl}?page=matches` },
    ];
    if (otherUsername) {
      buttons.push({ text: '💬 Open chat', url: `https://t.me/${otherUsername}` });
    }

    await this.send({
      type: 'match',
      telegramId,
      userId,
      text: `🎉 It's a match! You and ${otherName} connected.\n\nStart chatting!`,
      buttons,
    });
  }

  async notifyExpiryWarning(
    userId: string,
    telegramId: number,
    senderName: string,
    webAppUrl: string
  ): Promise<void> {
    await this.send({
      type: 'expiry_warning',
      telegramId,
      userId,
      text: `⏰ ${senderName}'s intro expires in 4 hours. Don't miss it!`,
      buttons: [{ text: '💬 Respond now', webApp: `${webAppUrl}?page=intros` }],
    });
  }

  async notifyReEngagement(
    userId: string,
    telegramId: number,
    message: string,
    webAppUrl: string
  ): Promise<void> {
    await this.send({
      type: 're_engagement',
      telegramId,
      userId,
      text: message,
      buttons: [{ text: '🔍 Open Tanish', webApp: webAppUrl }],
    });
  }

  // ===== Internal =====

  private async processJob(data: NotificationJob): Promise<boolean> {
    try {
      const keyboard = new InlineKeyboard();

      if (data.buttons) {
        for (const btn of data.buttons) {
          if (btn.webApp) {
            keyboard.webApp(btn.text, btn.webApp);
          } else if (btn.url) {
            keyboard.url(btn.text, btn.url);
          }
          keyboard.row();
        }
      }

      await this.bot.api.sendMessage(data.telegramId, data.text, {
        reply_markup: data.buttons ? keyboard : undefined,
        parse_mode: 'HTML',
      });

      // Notification delivery logged via pino, not Event table (operational, not product telemetry)

      return true;
    } catch (err: any) {
      // Handle "bot was blocked by user" gracefully
      if (err?.error_code === 403) {
        console.log(`User ${data.userId} blocked the bot, skipping.`);
        return false;
      }
      throw err; // Re-throw for BullMQ retry
    }
  }

  /**
   * Returns delay in ms if we're in quiet hours, 0 otherwise.
   */
  private getQuietHoursDelay(): number {
    const now = new Date();
    // Convert to Tashkent time (UTC+5)
    const tashkentHour = (now.getUTCHours() + 5) % 24;

    if (tashkentHour >= QUIET_HOURS.START || tashkentHour < QUIET_HOURS.END) {
      // Calculate ms until 08:00 Tashkent
      let hoursUntilEnd: number;
      if (tashkentHour >= QUIET_HOURS.START) {
        hoursUntilEnd = (24 - tashkentHour) + QUIET_HOURS.END;
      } else {
        hoursUntilEnd = QUIET_HOURS.END - tashkentHour;
      }
      return hoursUntilEnd * 60 * 60 * 1000;
    }

    return 0;
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    await this.queue.close();
  }
}
