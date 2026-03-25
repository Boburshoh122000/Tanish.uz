import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ru from './ru.json';
import uz from './uz.json';

/**
 * Detect language from Telegram WebApp or browser.
 * Priority:
 * 1. User's saved preference (stored in localStorage as fallback)
 * 2. Telegram language_code from initDataUnsafe
 * 3. Browser language
 * 4. Fallback: Russian (most widely understood in UZ)
 */
function detectLanguage(): string {
  // Check saved preference
  try {
    const saved = localStorage.getItem('tanish_lang');
    if (saved && ['en', 'ru', 'uz'].includes(saved)) return saved;
  } catch {
    // localStorage may be unavailable in some contexts
  }

  // Check Telegram WebApp
  try {
    const tg = (window as any).Telegram?.WebApp;
    const langCode = tg?.initDataUnsafe?.user?.language_code;
    if (langCode) {
      if (langCode === 'uz') return 'uz';
      if (langCode === 'ru') return 'ru';
      if (langCode.startsWith('en')) return 'en';
    }
  } catch {
    // Not in Telegram context
  }

  // Check browser language
  const browserLang = navigator.language?.toLowerCase();
  if (browserLang?.startsWith('uz')) return 'uz';
  if (browserLang?.startsWith('en')) return 'en';

  // Default: Russian
  return 'ru';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      uz: { translation: uz },
    },
    lng: detectLanguage(),
    fallbackLng: 'ru',
    interpolation: {
      escapeValue: false, // React already handles XSS
    },
    react: {
      useSuspense: false, // Avoid flash of untranslated content
    },
  });

/**
 * Change language and persist choice.
 */
export function changeLanguage(lang: 'en' | 'ru' | 'uz'): void {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem('tanish_lang', lang);
  } catch {
    // Ignore
  }
}

export default i18n;
