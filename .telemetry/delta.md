# Delta: Current → Target

**Product:** Tanish
**Date:** 2026-03-26
**Current events:** 32 (29 LIVE, 3 ORPHANED)
**Target events:** 24
**Net change:** -8 events (removed operational/system noise)

---

## Summary of Changes

| Action | Count | Details |
|--------|-------|---------|
| **Keep** (unchanged) | 9 | Core events that match target as-is |
| **Keep + Enrich** | 8 | Existing events with new/changed properties |
| **Add** (new events) | 4 | Closing identified analytics gaps |
| **Rename + Change** | 1 | profile_view → profile_viewed |
| **Merge** | 1 | verification_approved + verification_rejected → verification_reviewed |
| **Remove** | 9 | Operational/system events that don't belong in product analytics |

**Validation:** ADD(4) + KEEP(9) + KEEP+ENRICH(8) + RENAME(1) + MERGE(2→1) = 23 distinct event names = 24 target events (verification_reviewed merges 2 current events into 1). Correct.

---

## Add (not tracked today — 4 new events)

These directly close the analytics gaps identified in the product model.

| Event | Category | Why | Priority |
|-------|----------|-----|----------|
| `onboarding_started` | lifecycle | Orphaned in DailyMetrics (always 0). Needed for onboarding funnel (start → complete = conversion rate). | P1 |
| `batch_viewed` | core_value | **Closes the #1 analytics gap.** No visibility between `app_open` and `intro_sent`. Did the user see their batch? How many profiles? This is the "did the daily cycle start?" signal. | P0 |
| `chat_opened` | core_value | Orphaned in DailyMetrics and weekly-spark. Tracks whether matches actually lead to Telegram conversations. Measures the final step of the core loop. | P1 |
| `verification_requested` | admin | Orphaned in admin route. Verification submissions need tracking for admin queue management. | P2 |

### Implementation guidance for new events

**`onboarding_started`** — Write in the frontend when the onboarding screen mounts, via a new API endpoint `POST /api/onboarding/start` (no-op endpoint that just creates the event), OR piggyback on the first `app_open` where `isNewUser: true` and the user hasn't completed onboarding. The former is cleaner.

**`batch_viewed`** — Write in `GET /api/discovery/batch` route handler, after successfully returning the batch. Properties `batch_size` and `is_premium` are available in the handler.

**`chat_opened`** — Write when the user taps the "Open chat" deep link button. This is a frontend action that triggers a Telegram deep link (`t.me/username`). Add a `POST /api/intros/:id/chat-opened` endpoint that the frontend calls before opening the deep link. The API has the intro context to compute `hours_since_match`.

**`verification_requested`** — Write in `POST /api/verify/submit` route handler.

---

## Remove (tracked today, shouldn't be — 9 events)

| Current Event | Why Remove |
|---------------|-----------|
| `elo_adjustment` | Operational/system event. ELO scoring is internal mechanics, not user behavior. Generates high volume (~every ELO change for every user). ELO state is on the User model — query it directly. Move to application logs. |
| `notification:daily_batch` | Notification delivery is operational telemetry. Success/failure belongs in pino logs, not the product Event table. |
| `notification:new_intro` | Same as above. |
| `notification:match` | Same as above. |
| `notification:expiry_warning` | Same as above. |
| `notification:re_engagement` | Same as above. Additionally, the re-engagement cron uses Event queries for dedup — this couples analytics to delivery logic. Move dedup to Redis or a dedicated table. |
| `verification_approved` | Merged into `verification_reviewed` with `approved` boolean property. |
| `verification_rejected` | Merged into `verification_reviewed` with `approved` boolean property. |

**Impact of removing notification:* events:** The `re-engagement.ts` and `weekly-spark.ts` crons query Event for dedup. These queries must be migrated to an alternative (Redis key, dedicated table) before removing notification events.

**Impact of removing elo_adjustment:** No downstream consumers query this event type. Safe to remove immediately.

---

## Rename + Change (1 event)

| Current Name | Target Name | Changes |
|-------------|------------|---------|
| `profile_view` | `profile_viewed` | Renamed for past tense consistency. Added `position_in_batch`, `shared_interest_count`, `has_compatibility_score` properties. |

---

## Merge (2 → 1 event)

| Current Events | Target Event | Changes |
|---------------|-------------|---------|
| `verification_approved` + `verification_rejected` | `verification_reviewed` | Single event with `approved: boolean` property. Properties over events. |

---

## Keep + Enrich (existing events with property changes — 8 events)

| Event | Property Changes |
|-------|-----------------|
| `app_open` | Change `isNewUser` from optional (only on new user path) to `is_new_user: boolean, required: true` on all paths. Returning users get `is_new_user: false`. |
| `onboarding_complete` | **Add:** `interest_count`, `has_bio`, `has_university`, `has_workplace`, `referral_code`. Currently has zero properties — no visibility into onboarding quality. |
| `intro_sent` | **Add:** `question_text` (the icebreaker question). **Critical for icebreaker→match correlation.** |
| `intro_answered` | **Add:** `response_time_hours` (time between received and answered). |
| `intro_declined` | **Add:** `response_time_hours`. |
| `profile_edited` | **Add:** `fields_changed: string[]`. Currently has zero properties. |
| `premium_viewed` | **Add:** `is_promo: boolean`. |
| `premium_expired` | **Add:** `was_active_days: integer`. For premium retention analysis. |

---

## Keep (unchanged — 9 events)

| Current Event | Target Event | Notes |
|--------------|-------------|-------|
| `profile_liked` | `profile_liked` | Shape matches. Optionally add `position_in_batch`. |
| `profile_passed` | `profile_passed` | Shape matches. Optionally add `position_in_batch`. |
| `intro_received` | `intro_received` | Shape matches. |
| `intro_expired` | `intro_expired` | Shape matches. |
| `match_created` | `match_created` | Shape matches. |
| `content_flagged` | `content_flagged` | Remove `original` property (PII risk). Keep `context` and `flags`. |
| `report_submitted` | `report_submitted` | Shape matches. |
| `premium_purchased` | `premium_purchased` | Shape matches. **Fix double-write** — consolidate to premium.service.ts only. |
| `photo_uploaded` | `photo_uploaded` | Add `position` property. |

---

## Structural Changes (not event-specific)

### 1. Centralize event creation (Priority: P0)

Create `packages/api/src/services/tracking.ts`:
```typescript
export function trackEvent(userId: string, type: EventType, metadata?: Record<string, unknown>): Promise<void>
```

All 17 files should call `trackEvent()` instead of direct `prisma.event.create()`. Benefits:
- Single place to validate event types (catch typos)
- Single place to add future routing (PostHog, etc.)
- Consistent error handling (non-blocking — event failure shouldn't fail the user action)

### 2. Add `isTestUser` to User model (Priority: P1)

```prisma
isTestUser Boolean @default(false)
```

Set `true` during auth for users in `ADMIN_TELEGRAM_IDS`. Filter in DailyMetrics cron:
```sql
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE id = "Event"."userId" AND "isTestUser" = true)
```

### 3. Fix premium_purchased double-write (Priority: P1)

Remove the `prisma.event.create({ type: 'premium_purchased' })` call in `packages/bot/src/index.ts:186`. Keep only the one in `packages/api/src/services/premium.service.ts:85`.

### 4. Make event writes non-blocking (Priority: P2)

Current: `await prisma.event.create(...)` — failure propagates to user.
Target: `trackEvent()` should catch errors and log them, never blocking the user action.

### 5. Migrate notification dedup away from Event table (Priority: P2)

Before removing `notification:*` events, migrate the dedup queries in `re-engagement.ts` and `weekly-spark.ts` to use Redis keys or a dedicated `notification_log` table.

---

## Priority Order

| Priority | What | Why |
|----------|------|-----|
| **P0** | Add `batch_viewed` event | Closes the #1 analytics gap (app_open → intro_sent black box) |
| **P0** | Create centralized `trackEvent()` helper | Foundation for all other changes |
| **P1** | Add `onboarding_started` event | Fixes always-0 DailyMetrics column |
| **P1** | Add `chat_opened` event | Fixes always-0 DailyMetrics column + unlocks weekly-spark filtering |
| **P1** | Enrich `intro_sent` with `question_text` | Unlocks icebreaker quality analysis |
| **P1** | Fix `premium_purchased` double-write | Data integrity |
| **P1** | Add `isTestUser` to User model | Clean DailyMetrics |
| **P1** | Enrich `onboarding_complete`, `intro_answered/declined` with new properties | Richer funnel analysis |
| **P2** | Add `verification_requested` event | Admin completeness |
| **P2** | Rename `profile_view` → `profile_viewed` | Naming consistency |
| **P2** | Merge verification_approved/rejected → verification_reviewed | Cleaner event design |
| **P2** | Remove `elo_adjustment` events | Volume reduction |
| **P2** | Make event writes non-blocking | Reliability |
| **P3** | Migrate notification dedup to Redis | Prerequisite for notification:* removal |
| **P3** | Remove `notification:*` events | Final cleanup — only after dedup migration |
| **P3** | Enrich remaining events with optional properties | Polish |
