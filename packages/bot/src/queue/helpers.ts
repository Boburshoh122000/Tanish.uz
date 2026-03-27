/**
 * Queue helper functions for adding notification jobs.
 *
 * These can be imported from any package (api, matching, bot) —
 * they only create a BullMQ Queue client pointing at Redis.
 * The actual Worker that processes jobs runs in the bot process.
 */
import { NotificationType } from '@tanish/shared';
import {
  getNotificationQueue,
  type IntroNotificationData,
  type MatchNotificationData,
  type DailyBatchNotificationData,
  type ExpiryWarningData,
} from './notification.queue.js';

export async function queueIntroNotification(params: {
  receiverTelegramId: bigint;
  senderName: string;
  introPreview: string;
  language: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: IntroNotificationData = {
    type: NotificationType.NEW_INTRO,
    receiverTelegramId: params.receiverTelegramId.toString(),
    senderName: params.senderName,
    introPreview: params.introPreview,
    language: params.language,
  };
  await queue.add(NotificationType.NEW_INTRO, data);
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
    type: NotificationType.MATCH,
    telegramId: params.telegramId.toString(),
    matchName: params.matchName,
    matchUsername: params.matchUsername,
    matchProfileId: params.matchProfileId,
    language: params.language,
  };
  await queue.add(NotificationType.MATCH, data);
}

export async function queueDailyBatchNotification(params: {
  telegramId: bigint;
  matchCount: number;
  language: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: DailyBatchNotificationData = {
    type: NotificationType.DAILY_BATCH,
    telegramId: params.telegramId.toString(),
    matchCount: params.matchCount,
    language: params.language,
  };
  await queue.add(NotificationType.DAILY_BATCH, data);
}

export async function queueExpiryWarning(params: {
  telegramId: bigint;
  senderName: string;
  language: string;
}): Promise<void> {
  const queue = getNotificationQueue();
  const data: ExpiryWarningData = {
    type: NotificationType.EXPIRY_WARNING,
    telegramId: params.telegramId.toString(),
    senderName: params.senderName,
    language: params.language,
  };
  await queue.add(NotificationType.EXPIRY_WARNING, data);
}
