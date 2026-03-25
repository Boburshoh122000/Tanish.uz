import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { Bot } from 'grammy';
import { connectRedis, disconnectRedis } from './services/redis.js';
import { EloService } from './services/elo.service.js';
import { NotificationService } from './services/notification.service.js';
import { registerCronJobs, stopCronJobs } from './cron/index.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { introRoutes } from './routes/intros.js';
import { reportRoutes } from './routes/reports.js';
import { blockRoutes } from './routes/blocks.js';
import { discoveryRoutes } from './routes/discovery.js';
import { interestRoutes } from './routes/interests.js';
import { uploadRoutes } from './routes/upload.js';
import { premiumRoutes } from './routes/premium.js';
import { referralRoutes } from './routes/referrals.js';
import { adminRoutes } from './routes/admin.js';
import { PremiumService } from './services/premium.service.js';

// ===== Validate required env vars =====
const REQUIRED_ENV = ['TELEGRAM_BOT_TOKEN', 'DATABASE_URL', 'JWT_SECRET'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

// ===== Initialize services =====
export const prisma = new PrismaClient();

// Bot instance for sending notifications (no polling — bot package handles that)
export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

export const eloService = new EloService(prisma);
export let notificationService: NotificationService | null = null;
export let premiumService: PremiumService | null = null;

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
  },
});

// ===== Plugins =====
await app.register(cors, {
  origin: process.env.WEBAPP_URL || '*',
  credentials: true,
});

await app.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024 },
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// ===== Decorate =====
app.decorate('prisma', prisma);
app.decorate('eloService', eloService);

// Health check
app.get('/api/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '0.3.0',
  phase: 3,
}));

// ===== Routes =====
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(onboardingRoutes, { prefix: '/api/onboarding' });
await app.register(introRoutes, { prefix: '/api/intros' });
await app.register(reportRoutes, { prefix: '/api/reports' });
await app.register(blockRoutes, { prefix: '/api/blocks' });
await app.register(discoveryRoutes, { prefix: '/api/discovery' });
await app.register(interestRoutes, { prefix: '/api/interests' });
await app.register(uploadRoutes, { prefix: '/api/upload' });
await app.register(premiumRoutes, { prefix: '/api/premium' });
await app.register(referralRoutes, { prefix: '/api/referrals' });
await app.register(adminRoutes, { prefix: '/api/admin' });

// ===== Graceful shutdown =====
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down...`);
  stopCronJobs();
  if (notificationService) await notificationService.shutdown();
  await app.close();
  await disconnectRedis();
  await prisma.$disconnect();
  process.exit(0);
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}

// ===== Start =====
const PORT = parseInt(process.env.PORT || process.env.API_PORT || '3001', 10);
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://tanish.uz';

try {
  // Connect Redis (best-effort — app degrades gracefully without it)
  try {
    await connectRedis();
    app.log.info('✅ Redis connected');

    // Start notification service (requires Redis for BullMQ)
    notificationService = new NotificationService(bot, prisma);
    notificationService.startWorker();
    app.decorate('notificationService', notificationService);
  } catch (err) {
    app.log.warn('⚠️ Redis unavailable — running without notifications queue and ELO cache');
  }

  // Initialize premium service (needs bot, works without Redis)
  premiumService = new PremiumService(prisma, bot);

  // Register cron jobs (they handle null notificationService gracefully)
  registerCronJobs({
    prisma,
    eloService,
    notificationService: notificationService!,
    webAppUrl: WEBAPP_URL,
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`🚀 Tanish API v0.3.0 (Phase 3) running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export { app };
