// ===== App Constants =====

export const APP_NAME = 'Tanish';
export const APP_VERSION = '0.1.0';

// ===== Limits =====

export const LIMITS = {
  // Profile
  BIO_MAX_LENGTH: 300,
  ROLE_MAX_LENGTH: 100,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 50,
  MAX_PHOTOS: 5,
  MIN_PHOTOS: 1,
  MIN_INTERESTS: 5,
  MAX_INTERESTS: 8,
  PHOTO_MAX_SIZE_MB: 5,
  PHOTO_COMPRESSED_MAX_SIZE_MB: 1,
  PHOTO_MAX_DIMENSION: 1200,

  // Age
  MIN_AGE: 18,
  MAX_AGE: 35,
  DEFAULT_MIN_AGE: 18,
  DEFAULT_MAX_AGE: 28,

  // Matching
  FREE_DAILY_MATCHES: 3,
  PREMIUM_DAILY_MATCHES: 8,

  // Intros
  FREE_DAILY_INTROS: 5,
  PREMIUM_DAILY_INTROS: 15,
  INTRO_MIN_LENGTH: 20,
  INTRO_MAX_LENGTH: 500,
  INTRO_EXPIRY_HOURS: 48,

  // Rate Limiting
  MAX_REPORTS_PER_DAY: 5,
  MAX_PHOTO_UPLOADS_PER_HOUR: 3,
  API_RATE_LIMIT_PER_MINUTE: 100,
  MAX_NOTIFICATIONS_PER_2_MIN: 1,

  // Safety
  AUTO_SUSPEND_REPORT_THRESHOLD: 3,

  // ELO
  ELO_DEFAULT: 1000,
  ELO_MIN: 200,
  ELO_MAX: 2000,
  ELO_PREMIUM_BOOST: 200,
  ELO_PROFILE_BOOST: 300,

  // ELO Score Changes
  ELO_INTRO_RECEIVED: 5,
  ELO_MATCH_CREATED: 10,
  ELO_PROFILE_VERIFIED: 50,
  ELO_PROFILE_COMPLETE: 30,
  ELO_DAILY_ACTIVE: 2,
  ELO_INTRO_EXPIRED: -8,
  ELO_REPORTED: -20,
  ELO_INACTIVE_DAILY: -5,
  ELO_INACTIVE_EXTENDED: -10,
  ELO_INTRO_DECLINED: -3,
  ELO_ACTIVITY_CAP: 1200,
} as const;

// ===== Cities =====

export const CITIES = [
  'Tashkent',
  'Samarkand',
  'Bukhara',
  'Namangan',
  'Fergana',
  'Nukus',
  'Andijan',
  'Karshi',
] as const;

// ===== Universities =====

export const UNIVERSITIES = [
  // International / Joint universities
  'Westminster International University in Tashkent (WIUT)',
  'Inha University in Tashkent',
  'TEAM University',
  'Amity University Tashkent',
  'Turin Polytechnic University in Tashkent',
  'Webster University Tashkent',
  'Management Development Institute of Singapore in Tashkent (MDIST)',
  'Yeoju Technical Institute in Tashkent',
  'Bucheon University in Tashkent',
  'Ajou University in Tashkent',
  'Woosong University in Tashkent',
  'Kimyo International University in Tashkent',
  'Akfa University',
  'New Uzbekistan University',
  'Silk Road International University of Tourism and Cultural Heritage',
  'Tashkent International University of Education (TIUE)',
  'British Management University (BMU)',
  'Sharda University Tashkent',
  'Chandigarh University in Tashkent',
  'Asia Pacific University (APU) Tashkent',
  'IUT — International University in Tashkent',
  'Millat Umidi University',

  // National universities — Tashkent
  'National University of Uzbekistan (NUUz)',
  'Tashkent State University of Economics (TSUE)',
  'Tashkent State Law University (TSUL)',
  'Tashkent University of Information Technologies (TUIT)',
  'Tashkent State Technical University (TSTU)',
  'Tashkent Medical Academy (TMA)',
  'University of World Economy and Diplomacy (UWED)',
  'Tashkent State Agrarian University',
  'Tashkent Institute of Finance',
  'Tashkent State Pedagogical University',
  'Tashkent State University of Uzbek Language and Literature',
  'Tashkent State University of Oriental Studies',
  'Tashkent Institute of Architecture and Civil Engineering',
  'Tashkent Institute of Irrigation and Agricultural Mechanization (TIIAME)',
  'Tashkent Pharmaceutical Institute',
  'Tashkent State Dental Institute',
  'Tashkent State Conservatory',
  'National Institute of Art and Design (NIAD)',
  'Uzbekistan State University of Physical Culture and Sport',
  'University of Geological Sciences',
  'Tashkent Institute of Chemical Technology',
  'Tashkent Institute of Textile and Light Industry',
  'Academy of the Ministry of Internal Affairs',
  'Banking and Finance Academy',
  'Academy of Public Administration',
  'Military Technical Institute',

  // Regional universities
  'Samarkand State University (SamSU)',
  'Samarkand State Medical University',
  'Samarkand Institute of Economics and Service',
  'Bukhara State University',
  'Bukhara Engineering-Technological Institute',
  'Fergana State University',
  'Fergana Polytechnic Institute',
  'Namangan State University',
  'Namangan Engineering-Technological Institute',
  'Andijan State University',
  'Andijan State Medical Institute',
  'Karakalpak State University (Nukus)',
  'Karshi State University',
  'Karshi Engineering-Economics Institute',
  'Navoi State University of Mining and Technologies',
  'Jizzakh State Pedagogical University',
  'Termez State University',
  'Gulistan State University',
  'Urgench State University',
  'Kokand State Pedagogical Institute',

  // Other
  'Other',
] as const;

// ===== Quiet Hours =====

export const QUIET_HOURS = {
  START: 23, // 23:00 Tashkent
  END: 8,    // 08:00 Tashkent
  TIMEZONE: 'Asia/Tashkent',
} as const;

// ===== Profile Completeness Weights =====

export const PROFILE_WEIGHTS = {
  HAS_NAME: 0.10,
  HAS_PHOTO: 0.25,
  HAS_BIO: 0.15,
  HAS_ROLE: 0.15,
  HAS_5_PLUS_INTERESTS: 0.20,
  HAS_MULTIPLE_PHOTOS: 0.15,
} as const;

export const PROFILE_COMPLETE_THRESHOLD = 0.85;

// ===== Telegram Stars =====

export const PREMIUM_PRICE_STARS = 150; // ~$3
export const PREMIUM_PROMO_PRICE_STARS = 75;
export const PREMIUM_DURATION_DAYS = 30;
export const PREMIUM_GRACE_PERIOD_DAYS = 3;
