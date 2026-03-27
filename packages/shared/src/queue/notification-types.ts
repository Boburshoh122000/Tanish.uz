export const NOTIFICATION_QUEUE_NAME = 'tanish:notifications';

export const NotificationJobType = {
  DAILY_BATCH: 'DAILY_BATCH',
  NEW_INTRO: 'NEW_INTRO',
  MATCH: 'MATCH',
  EXPIRY_WARNING: 'EXPIRY_WARNING',
  WEEKLY_SPARK: 'WEEKLY_SPARK',
  RE_ENGAGEMENT: 'RE_ENGAGEMENT',
  PREMIUM_EXPIRED: 'PREMIUM_EXPIRED',
} as const;

export type NotificationJobType = (typeof NotificationJobType)[keyof typeof NotificationJobType];

export interface IntroNotificationData {
  type: typeof NotificationJobType.NEW_INTRO;
  receiverTelegramId: string;
  senderName: string;
  introPreview: string;
  language: string;
}

export interface MatchNotificationData {
  type: typeof NotificationJobType.MATCH;
  telegramId: string;
  matchName: string;
  matchUsername: string | null;
  matchProfileId: string;
  language: string;
}

export interface DailyBatchNotificationData {
  type: typeof NotificationJobType.DAILY_BATCH;
  telegramId: string;
  matchCount: number;
  language: string;
}

export interface ExpiryWarningData {
  type: typeof NotificationJobType.EXPIRY_WARNING;
  telegramId: string;
  senderName: string;
  language: string;
}

export interface WeeklySparkData {
  type: typeof NotificationJobType.WEEKLY_SPARK;
  telegramId: string;
  text: string;
}

export interface ReEngagementData {
  type: typeof NotificationJobType.RE_ENGAGEMENT;
  telegramId: string;
  text: string;
}

export interface PremiumExpiredData {
  type: typeof NotificationJobType.PREMIUM_EXPIRED;
  telegramId: string;
  language: string;
}

export type NotificationJobData =
  | IntroNotificationData
  | MatchNotificationData
  | DailyBatchNotificationData
  | ExpiryWarningData
  | WeeklySparkData
  | ReEngagementData
  | PremiumExpiredData;
