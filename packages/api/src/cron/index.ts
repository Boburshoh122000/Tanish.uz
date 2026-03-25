import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { NotificationService } from '../services/notification.service.js';
import type { EloService } from '../services/elo.service.js';
import { generateDailyBatches } from './daily-batch.js';
import { processIntroExpiry } from './intro-expiry.js';
import { processEloDecay } from './elo-decay.js';
import { processReEngagement } from './re-engagement.js';
import { processPremiumExpiry } from './premium-expiry.js';
import { computeDailyMetrics } from './daily-metrics.js';

interface CronDeps {
  prisma: PrismaClient;
  eloService: EloService;
  notificationService: NotificationService;
  webAppUrl: string;
}

const tasks: cron.ScheduledTask[] = [];

/**
 * Register all cron jobs. Call once on server start.
 * 
 * Schedule (all times UTC → Tashkent = UTC+5):
 *   02:00 UTC (07:00 Tashkent) — Daily metrics rollup (yesterday)
 *   03:00 UTC (08:00 Tashkent) — ELO decay + Redis rebuild
 *   04:00 UTC (09:00 Tashkent) — Daily batch generation + notifications
 *   Every hour                  — Intro expiry + warnings
 *   05:00 UTC (10:00 Tashkent) — Premium expiry check
 *   06:00 UTC (11:00 Tashkent) — Re-engagement
 */
export function registerCronJobs(deps: CronDeps): void {
  const { prisma, eloService, notificationService, webAppUrl } = deps;

  // Daily metrics rollup — 02:00 UTC daily
  tasks.push(
    cron.schedule('0 2 * * *', async () => {
      console.log('⏰ [CRON] Daily metrics rollup...');
      try {
        await computeDailyMetrics(prisma);
      } catch (err) {
        console.error('[CRON] Daily metrics failed:', err);
      }
    })
  );

  // ELO decay + Redis rebuild — 03:00 UTC daily
  tasks.push(
    cron.schedule('0 3 * * *', async () => {
      console.log('⏰ [CRON] ELO decay starting...');
      try {
        await processEloDecay(prisma, eloService);
      } catch (err) {
        console.error('[CRON] ELO decay failed:', err);
      }
    })
  );

  // Daily batch generation — 04:00 UTC daily
  tasks.push(
    cron.schedule('0 4 * * *', async () => {
      console.log('⏰ [CRON] Daily batch generation starting...');
      try {
        await generateDailyBatches(prisma, notificationService, webAppUrl);
      } catch (err) {
        console.error('[CRON] Daily batch generation failed:', err);
      }
    })
  );

  // Intro expiry — every hour
  tasks.push(
    cron.schedule('0 * * * *', async () => {
      try {
        await processIntroExpiry(prisma, eloService, notificationService, webAppUrl);
      } catch (err) {
        console.error('[CRON] Intro expiry failed:', err);
      }
    })
  );

  // Premium expiry — 05:00 UTC daily
  tasks.push(
    cron.schedule('0 5 * * *', async () => {
      console.log('⏰ [CRON] Premium expiry check...');
      try {
        await processPremiumExpiry(prisma, notificationService, webAppUrl);
      } catch (err) {
        console.error('[CRON] Premium expiry failed:', err);
      }
    })
  );

  // Re-engagement — 06:00 UTC daily
  tasks.push(
    cron.schedule('0 6 * * *', async () => {
      console.log('⏰ [CRON] Re-engagement starting...');
      try {
        await processReEngagement(prisma, notificationService, webAppUrl);
      } catch (err) {
        console.error('[CRON] Re-engagement failed:', err);
      }
    })
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
