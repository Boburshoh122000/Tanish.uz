# Railway Deployment Guide — Tanish

## Prerequisites
- GitHub repo: `https://github.com/Boburshoh122000/Tanish.uz.git`
- Railway account linked to GitHub
- Telegram bot token from @BotFather
- Cloudflare account (for R2 + DNS)

---

## Step 1: Create Railway project

1. Go to [railway.app/new](https://railway.app/new)
2. Click **"Deploy from GitHub repo"** → select `Boburshoh122000/Tanish.uz`
3. Railway creates a default service — **rename it to `api`**

## Step 2: Add database plugins

1. Click **"+ New"** in the project canvas → **PostgreSQL**
   - Railway auto-injects `DATABASE_URL` into all services
2. Click **"+ New"** → **Redis**
   - Railway auto-injects `REDIS_URL` into all services

## Step 3: Create the API service

1. Select the `api` service
2. Go to **Settings** → **General**:
   - Root directory: `/` (monorepo root)
   - Watch paths: `packages/api/**`, `packages/shared/**`, `packages/prisma/**`
3. Go to **Settings** → **Deploy**:
   - Custom start command:
     ```
     pnpm --filter @tanish/prisma exec prisma migrate deploy && pnpm --filter @tanish/api start
     ```
   - Health check path: `/api/health`
4. Go to **Settings** → **Networking**:
   - Generate a public domain (e.g., `tanish-api-production.up.railway.app`)
5. Add environment variables (Settings → Variables):
   ```
   TELEGRAM_BOT_TOKEN=<from BotFather>
   TELEGRAM_BOT_USERNAME=TanishBot
   JWT_SECRET=<openssl rand -hex 32>
   WEBAPP_URL=https://tanish.uz
   NODE_ENV=production
   ```

## Step 4: Create the Bot service

1. Click **"+ New"** → **GitHub Repo** → same repo
2. Rename to `bot`
3. Go to **Settings** → **General**:
   - Root directory: `/`
   - Watch paths: `packages/bot/**`, `packages/shared/**`
4. Go to **Settings** → **Deploy**:
   - Custom start command:
     ```
     pnpm --filter @tanish/bot start
     ```
5. Go to **Settings** → **Networking**:
   - Generate a public domain (e.g., `tanish-bot-production.up.railway.app`)
6. Add environment variables:
   ```
   TELEGRAM_BOT_TOKEN=<same token>
   TELEGRAM_BOT_USERNAME=TanishBot
   JWT_SECRET=<same secret>
   WEBAPP_URL=https://tanish.uz
   WEBHOOK_URL=https://tanish-bot-production.up.railway.app
   WEBHOOK_SECRET=<openssl rand -hex 16>
   NODE_ENV=production
   ```

## Step 5: Run initial migration + seed

Option A — Via Railway CLI:
```bash
npm install -g @railway/cli
railway login
railway link  # select your project
railway run pnpm --filter @tanish/prisma exec prisma migrate deploy
railway run pnpm --filter @tanish/prisma exec prisma db seed
```

Option B — The API start command already runs `prisma migrate deploy`.
For seeding, SSH into the service or add a one-time script.

## Step 6: Deploy frontend

### Option A: Cloudflare Pages (recommended — free, fast CDN)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Pages → Create
2. Connect GitHub repo
3. Build settings:
   - Framework: Vite
   - Build command: `pnpm --filter @tanish/web build`
   - Build output: `packages/web/dist`
   - Root directory: `/`
4. Environment variables:
   ```
   VITE_API_URL=https://tanish-api-production.up.railway.app
   VITE_BOT_USERNAME=TanishBot
   ```
5. Custom domain: `tanish.uz`

### Option B: Railway static site

1. Create another service from the same repo
2. Start command: `pnpm --filter @tanish/web build && npx serve packages/web/dist -s -l 3000`
3. Set `VITE_API_URL` and `VITE_BOT_USERNAME` as env vars

## Step 7: Configure Cloudflare R2

1. Cloudflare Dashboard → R2 → Create bucket: `tanish-photos`
2. Create API token with R2 read/write permissions
3. Add to Railway env vars (both api and bot services):
   ```
   R2_ACCOUNT_ID=<your account ID>
   R2_ACCESS_KEY_ID=<from API token>
   R2_SECRET_ACCESS_KEY=<from API token>
   R2_BUCKET_NAME=tanish-photos
   R2_PUBLIC_URL=https://photos.tanish.uz
   ```
4. Set up custom domain for R2 bucket:
   - R2 bucket settings → Custom domains → `photos.tanish.uz`
   - Add CNAME in Cloudflare DNS

## Step 8: Register bot with Telegram

The bot auto-registers its webhook on startup via `register-webhook.ts`.

If you need to do it manually:
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://tanish-bot-production.up.railway.app/bot/webhook&secret_token=<WEBHOOK_SECRET>"
```

Verify:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

## Step 9: Configure BotFather

Send to @BotFather:
```
/setname → Tanish
/setdescription → Meet interesting people in Tashkent. Professional & interest-based matching.
/setabouttext → 🤝 Curated daily matches based on your interests and profession
/setcommands →
start - Open Tanish
profile - Edit your profile
help - How it works
/setmenubutton → Web App URL: https://tanish.uz
```

---

## DNS Setup (tanish.uz)

| Record | Name | Value | Proxy |
|--------|------|-------|-------|
| CNAME | `@` | `tanish-web.pages.dev` | ✅ |
| CNAME | `api` | `tanish-api-production.up.railway.app` | ✅ |
| CNAME | `photos` | R2 custom domain | ✅ |

---

## Cost breakdown

| Service | Provider | Cost |
|---------|----------|------|
| PostgreSQL | Railway | Free (dev) / $5/mo (hobby) |
| Redis | Railway | Free (dev) |
| API server | Railway | ~$5/mo |
| Bot server | Railway | ~$5/mo |
| Frontend | Cloudflare Pages | Free |
| Photos | Cloudflare R2 | 10GB free |
| DNS/CDN | Cloudflare | Free |
| Domain | tanish.uz | ~$10/yr |
| **Total** | | **~$10-15/mo** |

---

## Monitoring

Railway provides built-in logs and metrics. For the MVP, this is enough.

```bash
# Check health
curl https://tanish-api-production.up.railway.app/api/health

# Check bot webhook
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# Watch logs
railway logs --service api
railway logs --service bot
```
