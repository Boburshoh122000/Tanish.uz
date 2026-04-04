import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { EloService } from '../services/elo.service.js';
import { generateDailyBatches } from './daily-batch.js';
import { processIntroExpiry } from './intro-expiry.js';
import { processEloDecay } from './elo-decay.js';
import { processReEngagement } from './re-engagement.js';
import { processPremiumExpiry } from './premium-expiry.js';
import { computeDailyMetrics } from './daily-metrics.js';
import { processWeeklySpark } from './weekly-spark.js';

interface CronDeps {
  prisma: PrismaClient;
  eloService: EloService;
  webAppUrl: string;
}

const tasks: cron.ScheduledTask[] = [];
const runningJobs = new Set<string>();

/** Simple in-memory mutex to prevent overlapping cron executions */
async function withLock(name: string, fn: () => Promise<void>): Promise<void> {
  if (runningJobs.has(name)) {
    console.log(`⏭️ [CRON] ${name} already running, skipping`);
    return;
  }
  runningJobs.add(name);
  try {
    await fn();
  } finally {
    runningJobs.delete(name);
  }
}

/**
 * Register all cron jobs. Call once on server start.
 *
 * Schedule (all times UTC → Tashkent = UTC+5):
 *   02:00 UTC (07:00 Tashkent) — Daily metrics rollup (yesterday)
 *   22:00 UTC (03:00 Tashkent) — ELO decay + Redis rebuild
 *   04:00 UTC (09:00 Tashkent) — Daily batch generation + notifications
 *   Every hour                  — Intro expiry + warnings
 *   05:00 UTC (10:00 Tashkent) — Premium expiry check
 *   06:00 UTC (11:00 Tashkent) — Re-engagement
 *   00:00 UTC (05:00 Tashkent) — Daily likes reset
 *   13:00 UTC Fridays (18:00 Tashkent) — Weekly spark
 */
export function registerCronJobs(deps: CronDeps): void {
  const { prisma, eloService, webAppUrl } = deps;

  // Daily metrics rollup — 02:00 UTC daily
  tasks.push(
    cron.schedule('0 2 * * *', () => withLock('daily-metrics', async () => {
      console.log('⏰ [CRON] Daily metrics rollup...');
      await computeDailyMetrics(prisma);
    }).catch((err) => console.error('[CRON] Daily metrics failed:', err)))
  );

  // ELO decay + Redis rebuild — 22:00 UTC (03:00 Tashkent)
  tasks.push(
    cron.schedule('0 22 * * *', () => withLock('elo-decay', async () => {
      console.log('⏰ [CRON] ELO decay starting...');
      await processEloDecay(prisma, eloService);
    }).catch((err) => console.error('[CRON] ELO decay failed:', err)))
  );

  // Daily batch generation — 04:00 UTC daily
  tasks.push(
    cron.schedule('0 4 * * *', () => withLock('daily-batch', async () => {
      console.log('⏰ [CRON] Daily batch generation starting...');
      await generateDailyBatches(prisma);
    }).catch((err) => console.error('[CRON] Daily batch generation failed:', err)))
  );

  // Intro expiry — every hour
  tasks.push(
    cron.schedule('0 * * * *', () => withLock('intro-expiry', async () => {
      await processIntroExpiry(prisma, eloService, webAppUrl);
    }).catch((err) => console.error('[CRON] Intro expiry failed:', err)))
  );

  // Premium expiry — 05:00 UTC daily
  tasks.push(
    cron.schedule('0 5 * * *', () => withLock('premium-expiry', async () => {
      console.log('⏰ [CRON] Premium expiry check...');
      await processPremiumExpiry(prisma, webAppUrl);
    }).catch((err) => console.error('[CRON] Premium expiry failed:', err)))
  );

  // Re-engagement — 06:00 UTC daily
  tasks.push(
    cron.schedule('0 6 * * *', () => withLock('re-engagement', async () => {
      console.log('⏰ [CRON] Re-engagement starting...');
      await processReEngagement(prisma);
    }).catch((err) => console.error('[CRON] Re-engagement failed:', err)))
  );

  // Daily likes reset — 00:00 UTC (05:00 Tashkent)
  tasks.push(
    cron.schedule('0 0 * * *', () => withLock('likes-reset', async () => {
      const { count } = await prisma.user.updateMany({ where: { dailyLikesUsed: { gt: 0 } }, data: { dailyLikesUsed: 0 } });
      if (count > 0) console.log(`[CRON] Reset dailyLikesUsed for ${count} users`);
    }).catch((err) => console.error('[CRON] Daily likes reset failed:', err)))
  );

  // Weekly spark — Fridays 13:00 UTC (18:00 Tashkent)
  tasks.push(
    cron.schedule('0 13 * * 5', () => withLock('weekly-spark', async () => {
      console.log('⏰ [CRON] Weekly spark starting...');
      await processWeeklySpark(prisma);
    }).catch((err) => console.error('[CRON] Weekly spark failed:', err)))
  );

  console.log(`✅ ${tasks.length} cron jobs registered`);
}

/**
 * Stop all cron jobs. Call on graceful shutdown.
 */
export function stopCronJobs(): void {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
  console.log('🛑 Cron jobs stopped');
}
