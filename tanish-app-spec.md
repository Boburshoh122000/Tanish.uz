# Tanish — Product & Technical Specification

> **Version:** 1.0 — Generated 2026-04-04 from codebase v0.3.0
>
> This document is the **single source of truth** for all product decisions,
> database schema, API design, matching logic, and feature scope.

---

## 1. Product Overview

**Tanish** ("acquaintance" in Uzbek) is a Telegram Mini App for people discovery —
connecting young professionals (18–35) in Uzbekistan based on shared interests,
profession, and goals. It runs entirely inside Telegram.

### 1.1 Core Philosophy

| Principle | Implementation |
|-----------|----------------|
| Scarcity drives value | Daily batch model: 3 free / 8 premium matches per day. No swiping. No infinite scroll. |
| Safety first | Mandatory icebreaker intro before chat. Three reports = auto-suspension. Content filtering. |
| Gender ratio is the kill metric | Every feature decision must consider: "Does this make the platform feel safe and valuable for women?" |
| Chat happens in Telegram | After matching, users connect via `t.me/username` deep link. We don't build a chat system. |
| Quality over quantity | Profile completeness < 85% = invisible in discovery feeds. |

### 1.2 Target Audience

- **Age:** 18–35 (configurable per user preference within this range)
- **Location:** Uzbekistan, primarily Tashkent (expandable to Samarkand, Bukhara, etc.)
- **Profile:** Young professionals, students, entrepreneurs
- **Languages:** Uzbek (Latin), Russian (default fallback), English

### 1.3 Supported Cities

Tashkent, Samarkand, Bukhara, Namangan, Fergana, Nukus, Andijan, Karshi

---

## 2. User Journey

```
Bot /start → Mini App opens → Auth (initData validation)
  ↓
New User? → Onboarding (4 steps) → Profile created
  ↓
Daily Discovery → Browse batch → Say Hi (intro) or Pass
  ↓
Intro sent → Icebreaker question + sender's answer delivered
  ↓
Receiver responds → Match created → Telegram deep link to chat
```

### 2.1 Onboarding Flow (4 Steps)

1. **Who are you?** — Gender, looking for (networking/friendship/relationship)
2. **What do you do?** — City (autocomplete), birth date, current role, university (autocomplete from 70+ UZ universities), workplace
3. **What are you into?** — Pick 5–8 interests from 6 categories (40+ seeded interests)
4. **One more thing** — Bio (optional, 300 char max), photos (1–3, first = primary), Telegram avatar auto-imported

### 2.2 Profile Completeness

Weighted calculation (must reach 85% to appear in discovery):

| Field | Weight |
|-------|--------|
| Has name | 10% |
| Has photo | 25% |
| Has bio | 15% |
| Has current role | 15% |
| Has 5+ interests | 20% |
| Has multiple photos | 15% |

---

## 3. Core Features

### 3.1 Discovery (Daily Batch)

- Users receive a **pre-computed daily batch** at 09:00 Tashkent time (cron job)
- **Free users:** 3 profiles/day
- **Premium users:** 8 profiles/day
- If a user opens before the cron runs (or is new), an **on-the-fly batch** is generated
- Each profile card shows: photos, name, age, role, bio, shared interests, compatibility badge
- Actions: **Say Hi** (triggers intro flow) or **Pass**
- Pull-to-refresh reloads the batch
- Profiles already actioned (liked/passed) are filtered out
- Blocked users are excluded in both directions

### 3.2 Intro System (Icebreaker)

The intro system is the **mandatory safety gate** between discovery and chat.

**Flow:**
1. Sender taps "Say Hi" on a profile card
2. System generates an **icebreaker question** based on shared interests between the two users
3. Sender writes their answer (20–500 characters, content-filtered)
4. Receiver gets a notification with the question + sender's answer
5. Receiver can **answer** (creates a match) or **decline** (shown as "expired" to sender)
6. On match: both users see each other's answers + Telegram deep link to chat

**Icebreaker Question Generation:**
- 61 questions across 7 categories (TECH, BUSINESS, CREATIVE, SPORTS, LIFESTYLE, ACADEMIC, GENERAL)
- Category selected based on shared interest distribution (weighted random)
- Previously used questions tracked in Redis SET (30-day TTL) to avoid repeats
- Falls back to GENERAL pool if no shared interests

**Daily Limits:**
- Free: 5 intros/day
- Premium: 15 intros/day
- Enforced via Redis counter with Prisma fallback

**Expiry:**
- Intros expire after 48 hours if not responded to
- Expiry cron runs hourly, updates status and adjusts ELO

### 3.3 Matching

**Scoring Engine** — 5-factor weighted score (0–1 range):

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Interest overlap | 30% | `shared_count / max(user_interests, 5)` |
| Profession match | 25% | 1.0 if same university OR same role (case-insensitive), else 0 |
| Activity score | 20% | Linear decay from 1.0 (today) to 0 over 7 days |
| ELO proximity | 15% | `1.0 - abs(diff) / 1000`, clamped [0,1]. Premium gets +200 boost. |
| Profile quality | 10% | 0.4 (bio) + 0.3 (2+ photos) + 0.3 (verified) |

**Batch Generation (Cron):**
- Processes all active users with complete profiles (last active within 7 days)
- Cursor-paginated in batches of 100
- For each user: query eligible candidates → score → take top N → upsert DailyBatch
- Exclusions: self, already liked/passed, blocked (both dirs), active intros (PENDING/ANSWERED)
- Filters: same city, gender preference, age range (birthDate range calculation)

### 3.4 ELO Scoring

Every user starts at **1000 ELO** (range: 200–2000).

| Event | Points |
|-------|--------|
| Intro received | +5 |
| Match created | +10 |
| Profile verified | +50 |
| Profile completed | +30 |
| Daily active | +2 (cap at 1200) |
| Intro expired | -8 |
| Reported | -20 |
| Inactive (daily decay) | -5 |
| Inactive (extended) | -10 |
| Intro declined | -3 |

**Premium ELO boost:** +200 virtual points added during matching (not stored).

**Decay cron:** Runs daily, reduces scores for inactive users.

### 3.5 Premium (Telegram Stars)

**Price:** 150 Telegram Stars/month (~$3), promo: 75 Stars first month

**Benefits:**
- 8 daily matches (vs. 3 free)
- 15 daily intros (vs. 5 free)
- See who likes you
- Profile boost once per week
- Priority matching
- Premium badge

**Payment Flow:**
1. Frontend calls `POST /api/premium/create-invoice`
2. API creates Telegram Stars invoice via bot
3. Bot handles `pre_checkout_query` (validates payload)
4. Bot handles `successful_payment` (activates premium, logs payment)
5. Premium expiry cron checks daily, deactivates expired subscriptions (3-day grace period)

### 3.6 Photo Verification

**Flow:**
1. User submits selfie (hand next to face) via `POST /api/verify/submit`
2. Uploaded to Cloudflare R2
3. Admin reviews in verification queue (`/admin/verifications`)
4. Approved → `user.verified = true`, ELO +50
5. Rejected → reason shown to user, can retry

### 3.7 Referral System

- Each user gets a unique referral code (8 hex chars, generated on demand)
- Share link: `t.me/{bot}?start=ref_{code}`
- Bot `/start` handler links referral on new user creation
- Both referrer and referred get a bonus match when the new user completes their profile
- Stats tracked: total referred, completed signups, bonus matches earned

### 3.8 Safety

**Report System:**
- Report reasons: Fake profile, Harassment, Spam, Inappropriate content, Other
- Optional detail text (500 chars max)
- **Three reports from different users = automatic suspension**
- Admin reviews in report queue, actions: Dismiss, Warn, Suspend, Ban

**Block System:**
- Bidirectional: blocker and blocked cannot see each other anywhere
- Blocking removes user from discovery, intros, matches
- Users can view and unblock from Settings

**Content Filtering:**
- Bio and intro answers are filtered for:
  - URLs and links (regex: `https?://`, `www.`, `t.me/`, `@`)
  - Phone numbers
  - HTML tags
  - Profanity (basic word list — needs Uzbek/Russian expansion)
- Flagged content is tracked via events but not blocked (soft filtering)

### 3.9 Notifications (BullMQ Pipeline)

**Architecture:** API enqueues → Redis BullMQ → Bot worker processes

**Notification Types:**
- `DAILY_BATCH` — "Your matches for today are ready!"
- `NEW_INTRO` — "Someone wants to meet you!"
- `MATCH` — "You matched with {name}!"
- `EXPIRY_WARNING` — "Your intro expires in 6 hours"
- `WEEKLY_SPARK` — Re-engagement for dormant matches
- `RE_ENGAGEMENT` — "Your friends are waiting"
- `PROFILE_TIP` — Suggestions to improve profile

**Quiet Hours:** 23:00–08:00 Tashkent time (UTC+5). Messages queued during quiet hours are held.

**Rate Limit:** Max 1 notification per 2 minutes per user.

---

## 4. Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Daily batch | 09:00 UTC+5 | Generate discovery batches for all active users |
| ELO decay | 00:30 UTC+5 | Reduce scores for users inactive > 3 days |
| Intro expiry | Hourly | Expire intros older than 48h, adjust ELO |
| Premium expiry | 01:00 UTC+5 | Deactivate expired premium (with 3-day grace) |
| Re-engagement | 18:00 UTC+5 | Notify users inactive for 3+ days |
| Weekly spark | Fridays 12:00 | Re-engagement for dormant matches |
| Daily metrics | 23:55 UTC+5 | Roll up daily stats into DailyMetrics |

---

## 5. Database Schema

### 5.1 Enums

- `Gender`: MALE, FEMALE
- `LookingFor`: NETWORKING, FRIENDSHIP, RELATIONSHIP
- `Language`: UZBEK, RUSSIAN, ENGLISH
- `InterestCategory`: TECH, BUSINESS, CREATIVE, SPORTS, LIFESTYLE, ACADEMIC
- `UserStatus`: ACTIVE, SUSPENDED, BANNED
- `IntroStatus`: PENDING, ANSWERED, MATCHED, EXPIRED
- `ReportReason`: FAKE_PROFILE, HARASSMENT, SPAM, INAPPROPRIATE_CONTENT, OTHER
- `ReportStatus`: PENDING, REVIEWED, ACTIONED, DISMISSED
- `VerificationStatus`: PENDING, APPROVED, REJECTED

### 5.2 Models

**User** — Core profile, ELO, preferences, status, ambassador/referral system
- Indexed on: `[city, gender, status]`, `[eloScore]`, `[lastActiveAt]`
- `telegramId: BigInt @unique` — Telegram user ID
- `eloScore: Float @default(1000)` — matching quality score
- `profileComplete: Boolean` — gates discovery visibility
- `referralCode: String? @unique` — for referral system
- Notification preferences: 4 boolean toggles

**Photo** — User photos with position ordering (0 = primary)

**Interest / UserInterest** — Interest graph (40+ seeded, 6 categories), composite key

**Like** — Pass/like actions, unique constraint on `[senderId, receiverId]`

**Intro** — Icebreaker conversations
- Status flow: PENDING → MATCHED (on answer) or EXPIRED (on decline/timeout)
- `chatUnlocked: Boolean` — set true when both answer
- `expiresAt: DateTime` — 48h from creation

**Report** — Safety reports with reason + optional details

**Block** — Bidirectional blocking, unique on `[blockerId, blockedId]`

**DailyBatch** — Pre-computed match sets, unique on `[userId, date]`

**Event** — Analytics events (25+ event types with typed metadata schemas)

**DailyMetrics** — Rolled-up daily stats (DAU, signups, intros, matches, revenue, gender ratio)

**Verification** — Photo verification requests with admin review

**Payment** — Telegram Stars payment records

---

## 6. API Design

### 6.1 Response Envelope

```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string } }
```

### 6.2 Authentication

- `POST /api/auth/telegram` — Validate Telegram `initData` via HMAC-SHA256, return JWT
- JWT stored in memory only (never localStorage)
- Token expires in 7 days
- initData must be less than 30 minutes old
- Auth middleware on all routes: validates JWT, checks user status, throttled `lastActiveAt` update (5-min intervals)

### 6.3 Endpoints

**Auth & Onboarding**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/telegram` | Authenticate via Telegram initData |
| POST | `/api/onboarding/complete` | Submit onboarding data |
| GET | `/api/health` | Health check (DB + Redis status) |

**Users & Profile**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users/me` | Current user profile |
| PATCH | `/api/users/me` | Update profile fields |
| DELETE | `/api/users/me` | Delete account (soft) |
| GET | `/api/users/:id` | Public profile view |
| PATCH | `/api/users/me/notifications` | Update notification preferences |

**Photos**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload/photo` | Upload photo to R2 |
| DELETE | `/api/photos/:id` | Delete photo |
| PATCH | `/api/photos/reorder` | Reorder photos |

**Discovery**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/discovery/batch` | Get today's matches |
| POST | `/api/discovery/action` | Like or pass |

**Intros**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/intros/create` | Send intro with answer |
| POST | `/api/intros/:id/respond` | Answer or decline |
| GET | `/api/intros/pending` | Pending intros (as receiver) |
| GET | `/api/intros/matched` | All matched intros |
| GET | `/api/intros/sent` | Intros I sent |
| GET | `/api/intros/question` | Preview icebreaker question |

**Safety**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/reports/create` | Report a user |
| POST | `/api/blocks/create` | Block a user |
| GET | `/api/blocks` | List blocked users |
| DELETE | `/api/blocks/:id` | Unblock |

**Premium & Growth**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/premium/status` | Premium status |
| POST | `/api/premium/create-invoice` | Generate Stars invoice |
| GET | `/api/referrals/link` | Get referral link |
| GET | `/api/referrals/stats` | Referral stats |
| POST | `/api/verify/submit` | Submit verification selfie |
| GET | `/api/verify/status` | Verification status |

**Admin** (requires admin Telegram ID)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/metrics` | Historical metrics (date range) |
| GET | `/api/admin/stats` | Live metrics |
| GET | `/api/admin/verifications/pending` | Verification queue |
| PATCH | `/api/admin/verifications/:id` | Review verification |
| GET | `/api/admin/reports` | Report queue |
| PATCH | `/api/admin/reports/:id` | Review report |
| GET | `/api/admin/users` | User list (search, filter, paginate) |
| GET | `/api/admin/users/detail/:id` | User detail |
| POST | `/api/admin/users/:id/grant-premium` | Grant premium |
| POST | `/api/admin/users/:id/revoke-premium` | Revoke premium |
| POST | `/api/admin/users/:id/message` | Send message via bot |
| PATCH | `/api/admin/users/:id/status` | Update user status |
| POST | `/api/admin/broadcast` | Broadcast message to users |

### 6.4 Validation

All input validated with **zod schemas** defined in `packages/shared/src/validation.ts`:
- `telegramAuthSchema` — initData string
- `onboardingSchema` — full onboarding payload with age validation
- `profileUpdateSchema` — partial profile update with bio URL/username stripping
- `createIntroSchema` — receiverId + answer (20–500 chars)
- `respondIntroSchema` — answer or decline (mutually exclusive)
- `createReportSchema` — reportedId + reason + optional details
- `createBlockSchema` — blockedUserId
- `discoveryActionSchema` — profileId + action (like/pass)
- `reorderPhotosSchema` — array of photo IDs
- `notificationPrefsSchema` — boolean toggles

---

## 7. Bot

### 7.1 Commands

| Command | Description |
|---------|-------------|
| `/start` | Opens Mini App, handles referral codes |
| `/profile` | Links to profile editor |
| `/referral` | Shows referral link |
| `/help` | Trilingual usage instructions |

### 7.2 Payment Handling

- `pre_checkout_query` — Validates invoice payload (userId, plan)
- `successful_payment` — Activates premium, logs payment, tracks event

### 7.3 Deployment Modes

- **Webhook mode** (production): Fastify server at `/bot/webhook`, auto-registers webhook URL
- **Polling mode** (development): Clears stale webhook, starts long polling

---

## 8. Analytics Events

25 tracked event types organized by funnel stage:

**Lifecycle:** app_open, onboarding_started, onboarding_complete
**Discovery:** batch_viewed, profile_liked, profile_passed
**Intros:** intro_sent, intro_received, intro_answered, intro_declined, intro_expired
**Match:** match_created, chat_opened
**Engagement:** profile_edited, profile_viewed, photo_uploaded, weekly_spark
**Safety:** content_flagged, report_submitted
**Revenue:** premium_viewed, premium_purchased, premium_expired
**Admin:** verification_requested, verification_reviewed
**Growth:** referral_credit, referral_used

All events have **typed zod metadata schemas** — no free-form metadata allowed.

---

## 9. Badge System

| Badge | Criteria | Priority |
|-------|----------|----------|
| Founder | `isTestUser && createdAt < launchDate` | 1 (highest) |
| Team | `isTestUser` | 2 |
| Ambassador | `isAmbassador` | 3 |
| Verified | `verified` | 4 |
| Premium | `isPremium` | 5 |

Displayed via `<BadgeRow>` component on profile cards.

---

## 10. i18n

- **Framework:** react-i18next
- **Languages:** English (en), Russian (ru, default fallback), Uzbek Latin (uz)
- **Detection order:** Saved preference → Telegram language_code → Browser language → Russian
- **Key count:** 370+ keys across 15 namespaces
- **Rule:** Uzbek always uses LATIN script (not Cyrillic)
- **Coverage:** All three languages have complete translations

---

## 11. Infrastructure

| Component | Service | Notes |
|-----------|---------|-------|
| API server | Railway | Fastify, port 3001 |
| Bot server | Railway | Grammy webhook, port 3002 |
| PostgreSQL | Railway (or Supabase) | Prisma ORM |
| Redis | Railway (or Upstash) | ioredis + BullMQ |
| Frontend | Cloudflare Pages (or Vercel) | Vite build, SPA |
| Photo storage | Cloudflare R2 | 5MB max, JPEG/PNG |

### 11.1 Environment Variables

All config validated via zod at startup (`packages/shared/src/config.ts`).

**Critical (crash on missing):**
- `TELEGRAM_BOT_TOKEN`
- `DATABASE_URL`
- `JWT_SECRET` (min 32 chars)

**Optional (graceful degradation):**
- `REDIS_URL` — notifications and rate limiting disabled without it
- `R2_*` — photo uploads fall back to Telegram file URLs
- `WEBHOOK_URL` — bot falls back to polling mode

---

## 12. Security

| Measure | Implementation |
|---------|----------------|
| Auth | HMAC-SHA256 initData validation, JWT (7-day expiry) |
| Token storage | Memory only (never localStorage) |
| Rate limiting | Redis sliding window, 100 req/min global |
| Content filtering | Strip HTML, URLs, phone numbers, profanity |
| Input validation | Zod on all endpoints, server-side |
| Auto-suspension | 3 reports from unique users |
| Ban check | Auth middleware rejects banned users |
| initData freshness | Reject data older than 30 minutes |
| ID exposure | Internal IDs never in error messages |
| BigInt safety | Pre-serialization hook converts BigInt to string |

---

## 13. Build Phases

### Phase 1 — MVP (Complete)
Bot scaffold, auth, database, onboarding, basic discovery, profile, report/block

### Phase 2 — Core Loop (Complete)
Matching engine with scoring, intro system, daily batch cron, notifications

### Phase 3 — Growth (Complete)
ELO scoring, premium + Stars, photo verification, referrals, analytics, admin dashboard

### Phase 4 — Polish (Current)
- [ ] Full i18n string audit
- [ ] Frontend photo compression before upload
- [ ] Uzbek/Russian profanity filter expansion
- [ ] Automated test suite
- [ ] Performance optimization (query analysis, caching)
- [ ] Admin dashboard enhancements
- [ ] Weekly spark feature (re-engage dormant matches)
- [ ] Re-engagement notification tuning

---

## 14. Key Metrics to Track

| Metric | Target | Why |
|--------|--------|-----|
| Gender ratio (M:F) | < 2:1 | **Kill metric** — platform dies if women leave |
| Daily batch completion rate | > 60% | Users should act on most of their batch |
| Intro → Match conversion | > 30% | Icebreaker quality indicator |
| Day-1 retention | > 40% | Onboarding effectiveness |
| Day-7 retention | > 20% | Core loop engagement |
| Intro response time | < 12h median | Conversation momentum |
| Premium conversion | > 5% | Revenue viability |
| Report rate | < 2% of DAU | Safety health |
| Profile completion rate | > 80% | Onboarding funnel |
| Chat open rate (post-match) | > 70% | Match quality |
