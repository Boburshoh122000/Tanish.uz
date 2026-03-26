import { z } from 'zod';

/**
 * Canonical event type names — the ONLY event types allowed in the Event table.
 * Anything not in this list is either dead code or should be deleted.
 *
 * Matches the target tracking plan in .telemetry/tracking-plan.yaml
 */
export const EVENT_TYPES = {
  // Lifecycle (3)
  APP_OPEN: 'app_open',
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETE: 'onboarding_complete',

  // Core Value — Discovery (3)
  BATCH_VIEWED: 'batch_viewed',
  PROFILE_LIKED: 'profile_liked',
  PROFILE_PASSED: 'profile_passed',

  // Core Value — Intros (5)
  INTRO_SENT: 'intro_sent',
  INTRO_RECEIVED: 'intro_received',
  INTRO_ANSWERED: 'intro_answered',
  INTRO_DECLINED: 'intro_declined',
  INTRO_EXPIRED: 'intro_expired',

  // Core Value — Match (2)
  MATCH_CREATED: 'match_created',
  CHAT_OPENED: 'chat_opened',

  // Engagement (3)
  PROFILE_EDITED: 'profile_edited',
  PROFILE_VIEWED: 'profile_viewed',
  PHOTO_UPLOADED: 'photo_uploaded',
  WEEKLY_SPARK: 'weekly_spark',

  // Safety (2)
  CONTENT_FLAGGED: 'content_flagged',
  REPORT_SUBMITTED: 'report_submitted',

  // Revenue (3)
  PREMIUM_VIEWED: 'premium_viewed',
  PREMIUM_PURCHASED: 'premium_purchased',
  PREMIUM_EXPIRED: 'premium_expired',

  // Admin (2)
  VERIFICATION_REQUESTED: 'verification_requested',
  VERIFICATION_REVIEWED: 'verification_reviewed',

  // Growth (2)
  REFERRAL_CREDIT: 'referral_credit',
  REFERRAL_USED: 'referral_used',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Runtime set of all valid event type strings */
export const VALID_EVENT_TYPES = new Set<string>(Object.values(EVENT_TYPES));

// ===== Metadata Schemas (zod) =====
// Define what properties are allowed/required in each event's metadata.
// Only user IDs (CUIDs) in metadata — NEVER PII.

const cuid = z.string().min(1);

export const eventMetadataSchemas = {
  // Lifecycle
  [EVENT_TYPES.APP_OPEN]: z.object({
    isNewUser: z.boolean(),
  }),
  [EVENT_TYPES.ONBOARDING_STARTED]: z.object({}).optional(),
  [EVENT_TYPES.ONBOARDING_COMPLETE]: z.object({
    interestCount: z.number().int(),
    hasBio: z.boolean(),
    hasUniversity: z.boolean(),
    hasWorkplace: z.boolean(),
    referralCode: z.string().optional(),
  }),

  // Discovery
  [EVENT_TYPES.BATCH_VIEWED]: z.object({
    batchSize: z.number().int(),
    isPremium: z.boolean(),
  }),
  [EVENT_TYPES.PROFILE_LIKED]: z.object({
    profileId: cuid,
    positionInBatch: z.number().int().optional(),
  }),
  [EVENT_TYPES.PROFILE_PASSED]: z.object({
    profileId: cuid,
    positionInBatch: z.number().int().optional(),
  }),

  // Intros
  [EVENT_TYPES.INTRO_SENT]: z.object({
    receiverId: cuid,
    introId: cuid,
    questionText: z.string(),
  }),
  [EVENT_TYPES.INTRO_RECEIVED]: z.object({
    senderId: cuid,
    introId: cuid,
  }),
  [EVENT_TYPES.INTRO_ANSWERED]: z.object({
    introId: cuid,
    responseTimeHours: z.number(),
  }),
  [EVENT_TYPES.INTRO_DECLINED]: z.object({
    introId: cuid,
    responseTimeHours: z.number(),
  }),
  [EVENT_TYPES.INTRO_EXPIRED]: z.object({
    introId: cuid,
  }),

  // Match
  [EVENT_TYPES.MATCH_CREATED]: z.object({
    matchedUserId: cuid,
  }),
  [EVENT_TYPES.CHAT_OPENED]: z.object({
    matchedUserId: cuid,
    hoursSinceMatch: z.number().optional(),
  }),

  // Engagement
  [EVENT_TYPES.PROFILE_EDITED]: z.object({
    fieldsChanged: z.array(z.string()),
  }),
  [EVENT_TYPES.PROFILE_VIEWED]: z.object({
    viewedUserId: cuid,
    positionInBatch: z.number().int().optional(),
    sharedInterestCount: z.number().int().optional(),
  }),
  [EVENT_TYPES.PHOTO_UPLOADED]: z.object({
    photoId: cuid,
    position: z.number().int(),
  }),
  [EVENT_TYPES.WEEKLY_SPARK]: z.object({
    matchId: cuid,
  }),

  // Safety
  [EVENT_TYPES.CONTENT_FLAGGED]: z.object({
    context: z.enum(['profile_bio', 'onboarding_bio', 'intro_answer', 'intro_response']),
    flags: z.array(z.string()),
  }),
  [EVENT_TYPES.REPORT_SUBMITTED]: z.object({
    reportedId: cuid,
    reason: z.string(),
  }),

  // Revenue
  [EVENT_TYPES.PREMIUM_VIEWED]: z.object({
    isPromo: z.boolean().optional(),
  }).optional(),
  [EVENT_TYPES.PREMIUM_PURCHASED]: z.object({
    amount: z.number().int(),
    transactionId: z.string(),
  }),
  [EVENT_TYPES.PREMIUM_EXPIRED]: z.object({
    wasActiveDays: z.number().int().optional(),
  }).optional(),

  // Admin
  [EVENT_TYPES.VERIFICATION_REQUESTED]: z.object({}).optional(),
  [EVENT_TYPES.VERIFICATION_REVIEWED]: z.object({
    approved: z.boolean(),
  }),

  // Growth
  [EVENT_TYPES.REFERRAL_CREDIT]: z.object({
    referredUserId: cuid,
  }),
  [EVENT_TYPES.REFERRAL_USED]: z.object({
    referrerId: cuid,
  }),
} as const satisfies Record<EventType, z.ZodTypeAny>;

export type EventMetadataMap = {
  [K in EventType]: z.infer<(typeof eventMetadataSchemas)[K]>;
};
