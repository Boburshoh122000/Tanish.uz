import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { introRoutes } from './routes/intros.js';
import { reportRoutes } from './routes/reports.js';
import { blockRoutes } from './routes/blocks.js';
import { discoveryRoutes } from './routes/discovery.js';
import { interestRoutes } from './routes/interests.js';

const prisma = new PrismaClient();

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
  },
});

// Plugins
await app.register(cors, {
  origin: process.env.WEBAPP_URL || '*',
  credentials: true,
});

await app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Decorate with prisma
app.decorate('prisma', prisma);

// Health check
app.get('/api/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '0.1.0',
}));

// Register routes
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(onboardingRoutes, { prefix: '/api/onboarding' });
await app.register(introRoutes, { prefix: '/api/intros' });
await app.register(reportRoutes, { prefix: '/api/reports' });
await app.register(blockRoutes, { prefix: '/api/blocks' });
await app.register(discoveryRoutes, { prefix: '/api/discovery' });
await app.register(interestRoutes, { prefix: '/api/interests' });

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

// Start
const PORT = parseInt(process.env.API_PORT || '3001', 10);
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`🚀 Tanish API running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export { app, prisma };
