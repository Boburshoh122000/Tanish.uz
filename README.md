# Tanish — Telegram Mini App

A people-discovery Mini App inside Telegram for young professionals (18-28) in Uzbekistan.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + @twa-dev/sdk
- **Backend**: Node.js + Fastify + TypeScript
- **Bot**: Grammy (Telegram Bot Framework)
- **Database**: PostgreSQL via Prisma ORM
- **Cache**: Redis (ioredis)
- **Monorepo**: pnpm workspaces

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy env and fill in values
cp .env.example .env

# Setup database
cd packages/prisma
npx prisma generate
npx prisma db push
npx tsx seed.ts
cd ../..

# Run all services
pnpm dev:api    # API → http://localhost:3001
pnpm dev:bot    # Bot → long polling mode
pnpm dev:web    # Frontend → http://localhost:3000
```

## Deployment (Railway)

Each service deploys as a separate Railway service from this monorepo:

| Service | Root Directory | Start Command |
|---------|---------------|---------------|
| API     | `/`           | `pnpm --filter @tanish/api start` |
| Bot     | `/`           | `pnpm --filter @tanish/bot start` |
| Web     | `packages/web` | (static site) |

Add **PostgreSQL** and **Redis** plugins in Railway dashboard — they auto-inject `DATABASE_URL` and `REDIS_URL`.

## Project Structure

```
packages/
  shared/    — Types, constants, Zod schemas
  prisma/    — Database schema + migrations + seed
  api/       — Fastify REST API
  bot/       — Grammy Telegram bot
  web/       — React Mini App frontend
  matching/  — Scoring algorithm
```

## License

Private — All rights reserved.
