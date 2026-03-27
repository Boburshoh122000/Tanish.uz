import { Bot, InlineKeyboard, GrammyError } from 'grammy';
import { QUIET_HOURS, type Language } from '@tanish/shared';

// ===== Translation Helpers =====

type Lang = Language | 'UZBEK' | 'RUSSIAN' | 'ENGLISH';

interface Translation {
  en: string;
  ru: string;
  uz: string;
}

const LANG_MAP: Record<string, 'en' | 'ru' | 'uz'> = {
  ENGLISH: 'en',
  RUSSIAN: 'ru',
  UZBEK: 'uz',
  en: 'en',
  ru: 'ru',
  uz: 'uz',
};

function tr(translations: Translation, lang: Lang): string {
  const key = LANG_MAP[lang] ?? 'ru';
  return translations[key];
}

// ===== Types =====

export interface SendResult {
  delivered: boolean;
  error?: string;
}

// ===== Service =====

export class NotificationService {
  constructor(private bot: Bot) {}

  /**
   * Low-level send. Catches bot-blocked, chat-not-found, and 429 rate limit errors.
   * Logs but does not throw.
   */
  async sendNotification(
    telegramId: bigint,
    text: string,
    buttons?: InlineKeyboard,
  ): Promise<SendResult> {
    try {
      await this.bot.api.sendMessage(Number(telegramId), text, {
        reply_markup: buttons,
        parse_mode: 'HTML',
      });
      return { delivered: true };
    } catch (err: unknown) {
      if (err instanceof GrammyError) {
        // 403 — bot blocked by user or chat not found
        if (err.error_code === 403) {
          console.log(`[notify] User ${telegramId} blocked bot or chat not found`);
          return { delivered: false, error: 'blocked' };
        }

        // 400 — chat not found / bad request
        if (err.error_code === 400) {
          console.log(`[notify] Bad request for ${telegramId}: ${err.description}`);
          return { delivered: false, error: 'bad_request' };
        }

        // 429 — rate limited
        if (err.error_code === 429) {
          const retryAfter = err.parameters?.retry_after ?? 30;
          console.warn(`[notify] Rate limited for ${telegramId}, retry after ${retryAfter}s`);
          return { delivered: false, error: `rate_limited:${retryAfter}` };
        }
      }

      // Unexpected error — log but don't crash
      console.error(`[notify] Unexpected error for ${telegramId}:`, err);
      return { delivered: false, error: 'unknown' };
    }
  }

  // ===== Typed Notification Methods =====

  async sendIntroNotification(
    telegramId: bigint,
    senderName: string,
    introPreview: string,
    language: Lang,
    webappUrl: string,
  ): Promise<SendResult> {
    const preview = introPreview.length > 80
      ? introPreview.slice(0, 77) + '...'
      : introPreview;

    const text = tr({
      en: `💬 <b>${senderName}</b> wants to connect!\n\nThey said: "<i>${preview}</i>"\n\nAnswer to unlock chat!`,
      ru: `💬 <b>${senderName}</b> хочет познакомиться!\n\nНаписал(а): "<i>${preview}</i>"\n\nОтветьте, чтобы открыть чат!`,
      uz: `💬 <b>${senderName}</b> tanishmoqchi!\n\nYozdi: "<i>${preview}</i>"\n\nChatni ochish uchun javob bering!`,
    }, language);

    const keyboard = new InlineKeyboard()
      .webApp(tr({ en: '💬 See intro', ru: '💬 Смотреть интро', uz: '💬 Tanishuvni ko\'rish' }, language), `${webappUrl}/intros`);

    return this.sendNotification(telegramId, text, keyboard);
  }

  async sendMatchNotification(
    telegramId: bigint,
    matchName: string,
    matchUsername: string | null,
    matchProfileId: string,
    language: Lang,
    webappUrl: string,
  ): Promise<SendResult> {
    const text = tr({
      en: `🎉 It's a match with <b>${matchName}</b>!\n\nStart chatting!`,
      ru: `🎉 Совпадение с <b>${matchName}</b>!\n\nНачинайте общаться!`,
      uz: `🎉 <b>${matchName}</b> bilan juftlik!\n\nSuhbatni boshlang!`,
    }, language);

    const keyboard = new InlineKeyboard();

    if (matchUsername) {
      keyboard.url(
        tr({ en: '💬 Open chat', ru: '💬 Открыть чат', uz: '💬 Chatni ochish' }, language),
        `https://t.me/${matchUsername}`,
      );
    }

    keyboard.webApp(
      tr({ en: '👤 See profile', ru: '👤 Профиль', uz: '👤 Profilni ko\'rish' }, language),
      `${webappUrl}/profile/${matchProfileId}`,
    );

    return this.sendNotification(telegramId, text, keyboard);
  }

  async sendDailyBatchNotification(
    telegramId: bigint,
    matchCount: number,
    language: Lang,
    webappUrl: string,
  ): Promise<SendResult> {
    const text = tr({
      en: `☀️ Your <b>${matchCount}</b> matches for today are ready!\n\nTap below to see who you got!`,
      ru: `☀️ Ваши <b>${matchCount}</b> совпадений на сегодня готовы!\n\nНажмите ниже, чтобы посмотреть!`,
      uz: `☀️ Bugungi <b>${matchCount}</b> ta tanishingiz tayyor!\n\nKo'rish uchun pastga bosing!`,
    }, language);

    const keyboard = new InlineKeyboard()
      .webApp(tr({ en: '🔍 See matches', ru: '🔍 Смотреть', uz: '🔍 Ko\'rish' }, language), `${webappUrl}/discovery`);

    return this.sendNotification(telegramId, text, keyboard);
  }

  async sendExpiryWarning(
    telegramId: bigint,
    senderName: string,
    language: Lang,
    webappUrl: string,
  ): Promise<SendResult> {
    const text = tr({
      en: `⏰ <b>${senderName}</b>'s intro expires in 4 hours. Don't miss it!`,
      ru: `⏰ Интро от <b>${senderName}</b> истечёт через 4 часа. Не пропустите!`,
      uz: `⏰ <b>${senderName}</b> ning tanishuvi 4 soatda tugaydi. O'tkazib yubormang!`,
    }, language);

    const keyboard = new InlineKeyboard()
      .webApp(tr({ en: '💬 Respond now', ru: '💬 Ответить сейчас', uz: '💬 Hozir javob berish' }, language), `${webappUrl}/intros`);

    return this.sendNotification(telegramId, text, keyboard);
  }

  // ===== Quiet Hours =====

  /**
   * Returns delay in ms if current Tashkent time is in quiet hours (23:00–08:00), 0 otherwise.
   */
  static getQuietHoursDelay(): number {
    const now = new Date();
    const tashkentHour = (now.getUTCHours() + 5) % 24;

    if (tashkentHour >= QUIET_HOURS.START || tashkentHour < QUIET_HOURS.END) {
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
}
