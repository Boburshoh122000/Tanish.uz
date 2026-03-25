# Tanish — Telegram Mini App for People Discovery

A curated matching app for young professionals (18-28) in Tashkent, Uzbekistan. Runs entirely inside Telegram as a Mini App.

## Architecture

```
Telegram Bot (@TanishBot)
  ├── Mini App (React + Vite + Tailwind + TWA SDK)
  │   ├── Onboarding (4 screens)
  │   ├── Discovery feed (daily batch)
  │   ├── Intro system (icebreakers)
  │   ├── Matches list
  │   ├── Profile editor
  │   └── Settings + safety
  ├── Bot (Grammy — commands, notifications, payments)
  └── API (Fastify + TypeScript)
      ├── Auth (Telegram initData HMAC-SHA256 + JWT)
      ├── Matching engine (5-factor scoring)
      ├── ELO service (Redis sorted sets)
      ├── Notification queue (BullMQ)
      ├── Content filter (URLs, phones, profanity)
      ├── Cron jobs (batch gen, expiry, ELO decay)
      └── Data layer (PostgreSQL + Redis)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Telegram SDK | @twa-dev/sdk |
| Backend | Node.js, Fastify, TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Cache/Queue | Redis (ioredis) + BullMQ |
| Bot | Grammy |
| Validation | Zod (shared frontend + backend) |
| State | Zustand |
| Monorepo | pnpm workspaces |

## Project Structure

```
packages/
  shared/     — Types, Zod schemas, constants, enums
  prisma/     — Database schema (12 models), migrations, seed data
  api/        — Fastify REST API (8 route modules, 6 services, 5 cron jobs)
  bot/        — Grammy bot (commands, payments, webhook)
  web/        — React Mini App (6 screens, Telegram SDK integration)
  matching/   — Scoring algorithm (isolated, testable)
```

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env and fill in values
cp .env.example .env

# 3. Set up database
pnpm db:generate
pnpm db:push
pnpm db:seed

# 4. Run all services
pnpm dev:api    # API on :3001
pnpm dev:bot    # Bot in long-polling mode
pnpm dev:web    # Frontend on :3000
```

## Deploy on Railway (No Supabase)

| Service | Railway Setup |
|---------|--------------|
| PostgreSQL | Add PostgreSQL plugin → auto-injects `DATABASE_URL` |
| Redis | Add Redis plugin → auto-injects `REDIS_URL` |
| API | New service from repo → start: `pnpm --filter @tanish/api start` |
| Bot | New service from repo → start: `pnpm --filter @tanish/bot start` |
| Frontend | Cloudflare Pages (free) or Railway static |

Required env vars on Railway: `TELEGRAM_BOT_TOKEN`, `JWT_SECRET`, `WEBAPP_URL`, `BOT_WEBHOOK_URL`

## Phase 2 Features (Current)

- **Matching Engine** — 5-factor scoring: interest overlap (30%), profession match (25%), activity (20%), ELO proximity (15%), profile quality (10%)
- **ELO Service** — Score adjustments with Redis sorted set sync, tier-based matching
- **Notification Queue** — BullMQ with quiet hours (23:00-08:00 Tashkent), dedup, retry
- **Content Filter** — Strips URLs, phone numbers, @usernames, flags profanity
- **Daily Batch Cron** — 09:00 Tashkent, cursor pagination, 100 users/chunk
- **Intro Expiry** — Hourly check, 4-hour warnings, ELO penalties
- **ELO Decay** — Inactive 3+ days: -5/day, 14+ days: -10/day, floor at 200
- **Re-engagement** — Day 3/7/14/30 nudge notifications
- **Premium Expiry** — Auto-downgrade when subscription lapses

## Key Product Rules

1. No free messaging on first contact — icebreaker system is mandatory
2. Daily batch only — 3 (free) / 8 (premium) matches per day, no swiping
3. Chat happens in Telegram — deep links to t.me/username after match
4. Three reports = auto-suspension
5. Profile completeness gates discovery (85% threshold)
