/**
 * Content filtering for user-generated text (bios, intro answers).
 * Strips dangerous content, flags suspicious content for review.
 */

// ===== Patterns =====

const URL_PATTERN = /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|org|net|io|uz|ru|me|co)[^\s]*/gi;
const PHONE_PATTERN = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{2,4}/g;
const TELEGRAM_USERNAME_PATTERN = /@[a-zA-Z][a-zA-Z0-9_]{3,31}/g;
const HTML_TAG_PATTERN = /<\/?[^>]+(>|$)/g;
const INSTAGRAM_PATTERN = /instagram\.?\s*:?\s*@?[a-zA-Z0-9_.]+/gi;

// Profanity blocklists (minimal — flag only, don't block)
// These cover the most common slurs/harassment terms.
// Not an exhaustive list — extend as needed.
const PROFANITY_EN = [
  'fuck', 'shit', 'bitch', 'dick', 'ass', 'cunt', 'whore', 'slut',
  'nigger', 'faggot', 'retard',
];

const PROFANITY_RU = [
  'блять', 'сука', 'хуй', 'пизд', 'ебат', 'нахуй', 'бля',
  'мудак', 'дебил', 'шлюха', 'пидор',
];

const PROFANITY_UZ = [
  'siktir', 'jalab', "ko'tak", 'axmoq', 'shirmoy',
];

const ALL_PROFANITY = [...PROFANITY_EN, ...PROFANITY_RU, ...PROFANITY_UZ];

// ===== Filter Result =====

export interface FilterResult {
  text: string;          // Cleaned text
  flagged: boolean;      // True if suspicious content was found
  flags: string[];       // List of issues found
  original: string;      // Original text for admin review
}

// ===== Main Filter =====

export function filterContent(input: string): FilterResult {
  const original = input;
  const flags: string[] = [];
  let text = input;

  // 1. Strip HTML tags
  HTML_TAG_PATTERN.lastIndex = 0;
  if (HTML_TAG_PATTERN.test(text)) {
    HTML_TAG_PATTERN.lastIndex = 0;
    text = text.replace(HTML_TAG_PATTERN, '');
    flags.push('html_stripped');
  }

  // 2. Replace URLs
  URL_PATTERN.lastIndex = 0;
  if (URL_PATTERN.test(text)) {
    URL_PATTERN.lastIndex = 0;
    text = text.replace(URL_PATTERN, '[link removed]');
    flags.push('url_removed');
  }

  // 3. Replace phone numbers
  PHONE_PATTERN.lastIndex = 0;
  if (PHONE_PATTERN.test(text)) {
    PHONE_PATTERN.lastIndex = 0;
    text = text.replace(PHONE_PATTERN, '[number removed]');
    flags.push('phone_removed');
  }

  // 4. Replace Telegram @usernames (in bios only — intros are fine)
  TELEGRAM_USERNAME_PATTERN.lastIndex = 0;
  if (TELEGRAM_USERNAME_PATTERN.test(text)) {
    TELEGRAM_USERNAME_PATTERN.lastIndex = 0;
    text = text.replace(TELEGRAM_USERNAME_PATTERN, '[username removed]');
    flags.push('username_removed');
  }

  // 5. Replace Instagram handles
  INSTAGRAM_PATTERN.lastIndex = 0;
  if (INSTAGRAM_PATTERN.test(text)) {
    INSTAGRAM_PATTERN.lastIndex = 0;
    text = text.replace(INSTAGRAM_PATTERN, '[social removed]');
    flags.push('instagram_removed');
  }

  // 6. Check for profanity (flag, don't remove)
  const lowerText = text.toLowerCase();
  const foundProfanity = ALL_PROFANITY.filter((word) => lowerText.includes(word));
  if (foundProfanity.length > 0) {
    flags.push(`profanity_detected:${foundProfanity.join(',')}`);
  }

  // 7. Trim whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return {
    text,
    flagged: flags.length > 0,
    flags,
    original,
  };
}

/**
 * Light filter for intro answers — allows @usernames since
 * users who matched can share contact info.
 */
export function filterIntroAnswer(input: string): FilterResult {
  const original = input;
  const flags: string[] = [];
  let text = input;

  // Strip HTML
  HTML_TAG_PATTERN.lastIndex = 0;
  text = text.replace(HTML_TAG_PATTERN, '');

  // Replace URLs
  URL_PATTERN.lastIndex = 0;
  if (URL_PATTERN.test(text)) {
    URL_PATTERN.lastIndex = 0;
    text = text.replace(URL_PATTERN, '[link removed]');
    flags.push('url_removed');
  }

  // Check profanity (flag only)
  const lowerText = text.toLowerCase();
  const foundProfanity = ALL_PROFANITY.filter((word) => lowerText.includes(word));
  if (foundProfanity.length > 0) {
    flags.push(`profanity_detected:${foundProfanity.join(',')}`);
  }

  text = text.replace(/\s+/g, ' ').trim();

  return {
    text,
    flagged: flags.length > 0,
    flags,
    original,
  };
}
