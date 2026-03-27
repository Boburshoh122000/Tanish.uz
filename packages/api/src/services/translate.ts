/**
 * Trilingual translation helper for bot notifications.
 * Used by notification queue workers and bot commands.
 *
 * Language is determined by user.preferredLanguage from the database.
 */

type Lang = 'UZBEK' | 'RUSSIAN' | 'ENGLISH';

interface Translation {
  en: string;
  ru: string;
  uz: string;
}

const LANG_MAP: Record<Lang, 'en' | 'ru' | 'uz'> = {
  ENGLISH: 'en',
  RUSSIAN: 'ru',
  UZBEK: 'uz',
};

function t(translations: Translation, lang: Lang): string {
  const key = LANG_MAP[lang] || 'ru';
  return translations[key];
}

// ===== Notification Templates =====

export function dailyBatchMessage(lang: Lang): string {
  return t({
    en: '☀️ Good morning! Your matches for today are ready.\n\nTap below to see who you got!',
    ru: '☀️ Доброе утро! Ваши совпадения на сегодня готовы.\n\nНажмите ниже, чтобы посмотреть!',
    uz: '☀️ Xayrli tong! Bugungi tanishlaringiz tayyor.\n\nKo\'rish uchun pastga bosing!',
  }, lang);
}

export function newIntroMessage(lang: Lang, senderName: string, preview: string): string {
  return t({
    en: `💬 ${senderName} wants to connect with you!\n\nThey said: "${preview}"\n\nAnswer to unlock chat!`,
    ru: `💬 ${senderName} хочет с вами познакомиться!\n\nОни написали: "${preview}"\n\nОтветьте, чтобы открыть чат!`,
    uz: `💬 ${senderName} siz bilan tanishmoqchi!\n\nUlar yozdi: "${preview}"\n\nChatni ochish uchun javob bering!`,
  }, lang);
}

export function matchMessage(lang: Lang, otherName: string): string {
  return t({
    en: `🎉 It's a match! You and ${otherName} connected.\n\nStart chatting!`,
    ru: `🎉 Совпадение! Вы и ${otherName} связались.\n\nНачинайте общаться!`,
    uz: `🎉 Juftlik! Siz va ${otherName} bog'landingiz.\n\nSuhbatni boshlang!`,
  }, lang);
}

export function expiryWarningMessage(lang: Lang, senderName: string): string {
  return t({
    en: `⏰ ${senderName}'s intro expires in 4 hours. Don't miss it!`,
    ru: `⏰ Интро от ${senderName} истечёт через 4 часа. Не пропустите!`,
    uz: `⏰ ${senderName} ning tanishuvi 4 soatda tugaydi. O'tkazib yubormang!`,
  }, lang);
}

export function weeklySparkMessage(lang: Lang, otherName: string, question: string): string {
  return t({
    en: `💡 Here's a conversation starter for you and ${otherName}:\n\n"${question}"`,
    ru: `💡 Вот тема для разговора с ${otherName}:\n\n"${question}"`,
    uz: `💡 ${otherName} bilan suhbat uchun mavzu:\n\n"${question}"`,
  }, lang);
}

export function reEngagementMessages(lang: Lang): Record<string, string> {
  return {
    day3: t({
      en: 'Your matches are waiting! See who\'s interested in you 🔍',
      ru: 'Ваши совпадения ждут! Посмотрите, кому вы интересны 🔍',
      uz: 'Tanishlaringiz kutmoqda! Kim sizga qiziqayotganini ko\'ring 🔍',
    }, lang),
    day7_with_intros: t({
      en: 'You have unread intros. Come back and connect! 💬',
      ru: 'У вас есть непрочитанные интро. Вернитесь и познакомьтесь! 💬',
      uz: 'O\'qilmagan tanishuvlaringiz bor. Qaytib keling! 💬',
    }, lang),
    day14: t({
      en: 'We miss you! Your profile is getting less visible. Open Tanish to stay in the game.',
      ru: 'Мы скучаем! Ваш профиль становится менее заметным. Откройте Tanish.',
      uz: 'Siz sog\'indik! Profilingiz kamroq ko\'rinmoqda. Tanish ni oching.',
    }, lang),
    day30: t({
      en: 'Your profile will be hidden from discovery soon. Tap to stay active.',
      ru: 'Ваш профиль скоро скроется из поиска. Нажмите, чтобы остаться активным.',
      uz: 'Profilingiz tez orada yashirinadi. Faol qolish uchun bosing.',
    }, lang),
  };
}

export function premiumExpiredMessage(lang: Lang): string {
  return t({
    en: '⭐ Your Tanish Premium has expired.\n\nYou\'re back to 3 daily matches. Upgrade again to keep the benefits!',
    ru: '⭐ Ваш Tanish Премиум истёк.\n\nВы вернулись к 3 совпадениям в день. Продлите подписку!',
    uz: '⭐ Tanish Premiumingiz tugadi.\n\nKuniga 3 ta moslikka qaytdingiz. Imtiyozlarni saqlab qolish uchun qayta obuna bo\'ling!',
  }, lang);
}

export function premiumActivatedMessage(lang: Lang): string {
  return t({
    en: '✨ Welcome to Tanish Premium!\n\n🎯 8 daily matches\n👀 See who likes you\n⚡ Profile boost once per week\n🏆 Priority matching\n\nEnjoy your upgraded experience!',
    ru: '✨ Добро пожаловать в Tanish Премиум!\n\n🎯 8 совпадений в день\n👀 Узнайте, кому вы нравитесь\n⚡ Буст профиля раз в неделю\n🏆 Приоритетный подбор\n\nПриятного использования!',
    uz: '✨ Tanish Premiumga xush kelibsiz!\n\n🎯 Kuniga 8 ta moslik\n👀 Sizni kim yoqtirishini bilib oling\n⚡ Haftada bir marta profil busti\n🏆 Ustuvor tanlash\n\nYangilangan tajribadan rohatlaning!',
  }, lang);
}

export function verificationApprovedMessage(lang: Lang): string {
  return t({
    en: '✅ Your profile is now verified! You\'ll get a trust badge visible to everyone.',
    ru: '✅ Ваш профиль подтверждён! Вы получили значок доверия.',
    uz: '✅ Profilingiz tasdiqlandi! Siz ishonch nishoniga ega bo\'ldingiz.',
  }, lang);
}

export function verificationRejectedMessage(lang: Lang): string {
  return t({
    en: '❌ Verification failed. Please try again with a clearer selfie that matches your profile photo.',
    ru: '❌ Проверка не пройдена. Попробуйте снова с более чётким селфи, совпадающим с фото профиля.',
    uz: '❌ Tasdiqlash muvaffaqiyatsiz. Profil rasmingizga mos aniqroq selfi bilan qaytadan urinib ko\'ring.',
  }, lang);
}

// ===== Button Labels =====

export function seeMatchesButton(lang: Lang): string {
  return t({ en: '🔍 See matches', ru: '🔍 Смотреть', uz: '🔍 Ko\'rish' }, lang);
}

export function seeIntroButton(lang: Lang): string {
  return t({ en: '💬 See intro', ru: '💬 Смотреть интро', uz: '💬 Tanishuvni ko\'rish' }, lang);
}

export function openChatButton(lang: Lang): string {
  return t({ en: '💬 Open chat', ru: '💬 Открыть чат', uz: '💬 Chatni ochish' }, lang);
}

export function respondNowButton(lang: Lang): string {
  return t({ en: '💬 Respond now', ru: '💬 Ответить сейчас', uz: '💬 Hozir javob berish' }, lang);
}
