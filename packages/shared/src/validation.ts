import { z } from 'zod';
import { LIMITS, CITIES } from './constants.js';

// ===== Auth =====

export const telegramAuthSchema = z.object({
  initData: z.string().min(1, 'initData is required'),
});

// ===== Onboarding =====

export const onboardingSchema = z.object({
  gender: z.enum(['MALE', 'FEMALE']),
  lookingFor: z.array(z.enum(['NETWORKING', 'FRIENDSHIP', 'RELATIONSHIP'])).min(1, 'Select at least one'),
  city: z.enum(CITIES as unknown as [string, ...string[]]).default('Tashkent'),
  birthDate: z.string().refine((val) => {
    const date = new Date(val);
    const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age >= LIMITS.MIN_AGE && age <= LIMITS.MAX_AGE;
  }, `Age must be between ${LIMITS.MIN_AGE} and ${LIMITS.MAX_AGE}`),
  currentRole: z.string().min(1).max(LIMITS.ROLE_MAX_LENGTH),
  university: z.string().max(100).optional(),
  workplace: z.string().max(100).optional(),
  interestIds: z.array(z.string()).min(LIMITS.MIN_INTERESTS).max(LIMITS.MAX_INTERESTS),
  bio: z.string().max(LIMITS.BIO_MAX_LENGTH).optional(),
  languages: z.array(z.enum(['UZBEK', 'RUSSIAN', 'ENGLISH'])).min(1).default(['RUSSIAN']),
});

// ===== Profile Update =====

export const profileUpdateSchema = z.object({
  firstName: z.string().min(LIMITS.NAME_MIN_LENGTH).max(LIMITS.NAME_MAX_LENGTH)
    .regex(/^[a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ\s\-']+$/, 'Invalid name characters')
    .optional(),
  lastName: z.string().max(LIMITS.NAME_MAX_LENGTH).nullable().optional(),
  bio: z.string().max(LIMITS.BIO_MAX_LENGTH)
    .refine((val) => !val || !/(https?:\/\/|www\.|t\.me\/|@)/i.test(val), 'Links and usernames are not allowed in bio')
    .nullable()
    .optional(),
  currentRole: z.string().max(LIMITS.ROLE_MAX_LENGTH).nullable().optional(),
  university: z.string().max(100).nullable().optional(),
  workplace: z.string().max(100).nullable().optional(),
  city: z.enum(CITIES as unknown as [string, ...string[]]).optional(),
  lookingFor: z.array(z.enum(['NETWORKING', 'FRIENDSHIP', 'RELATIONSHIP'])).min(1).optional(),
  languages: z.array(z.enum(['UZBEK', 'RUSSIAN', 'ENGLISH'])).min(1).optional(),
  interestIds: z.array(z.string()).min(LIMITS.MIN_INTERESTS).max(LIMITS.MAX_INTERESTS).optional(),
  minAge: z.number().min(LIMITS.MIN_AGE).max(LIMITS.MAX_AGE).optional(),
  maxAge: z.number().min(LIMITS.MIN_AGE).max(LIMITS.MAX_AGE).optional(),
  genderPref: z.enum(['MALE', 'FEMALE']).nullable().optional(),
}).refine((data) => {
  if (data.minAge !== undefined && data.maxAge !== undefined) {
    return data.minAge <= data.maxAge;
  }
  return true;
}, 'minAge must be less than or equal to maxAge');

// ===== Intro =====

export const createIntroSchema = z.object({
  receiverId: z.string().min(1),
  answer: z.string().min(LIMITS.INTRO_MIN_LENGTH).max(LIMITS.INTRO_MAX_LENGTH),
});

export const respondIntroSchema = z.object({
  answer: z.string().min(LIMITS.INTRO_MIN_LENGTH).max(LIMITS.INTRO_MAX_LENGTH).optional(),
  decline: z.boolean().optional(),
}).refine((data) => data.answer || data.decline, 'Must provide answer or decline');

// ===== Report =====

export const createReportSchema = z.object({
  reportedId: z.string().min(1),
  reason: z.enum(['FAKE_PROFILE', 'HARASSMENT', 'SPAM', 'INAPPROPRIATE_CONTENT', 'OTHER']),
  details: z.string().max(500).optional(),
});

// ===== Block =====

export const createBlockSchema = z.object({
  blockedUserId: z.string().min(1),
});

// ===== Discovery Action =====

export const discoveryActionSchema = z.object({
  profileId: z.string().min(1),
  action: z.enum(['like', 'pass']),
});

export type DiscoveryActionInput = z.infer<typeof discoveryActionSchema>;

// ===== Photo Reorder =====

export const reorderPhotosSchema = z.object({
  photoIds: z.array(z.string()).min(1).max(LIMITS.MAX_PHOTOS),
});

// ===== Notification Preferences =====

export const notificationPrefsSchema = z.object({
  dailyBatch: z.boolean().optional(),
  intros: z.boolean().optional(),
  matches: z.boolean().optional(),
  reEngagement: z.boolean().optional(),
});

export type TelegramAuthInput = z.infer<typeof telegramAuthSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type CreateIntroInput = z.infer<typeof createIntroSchema>;
export type RespondIntroInput = z.infer<typeof respondIntroSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type CreateBlockInput = z.infer<typeof createBlockSchema>;
export type ReorderPhotosInput = z.infer<typeof reorderPhotosSchema>;
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
