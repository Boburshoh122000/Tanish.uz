import { PrismaClient } from '@prisma/client';
import { LIMITS, CITIES } from '@tanish/shared';
import type { EloService } from '../services/elo.service.js';

/**
 * Daily ELO decay for inactive users. Runs at 03:00 UTC.
 * 
 * - Inactive > 3 days: -5/day
 * - Inactive > 14 days: -10/day
 * - Floor at ELO_MIN (200)
 * 
 * Also rebuilds Redis ELO sorted sets nightly.
 */
export async function processEloDecay(
  prisma: PrismaClient,
  eloService: EloService
): Promise<{ decayed: number; rebuilt: number }> {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  let decayed = 0;

  // Extended inactive (14+ days): -10/day
  const extendedInactive = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      lastActiveAt: { lt: fourteenDaysAgo },
      eloScore: { gt: LIMITS.ELO_MIN },
    },
    select: { id: true, lastActiveAt: true },
  });

  if (extendedInactive.length > 0) {
    const ids = extendedInactive.map((u) => u.id);
    const count = await eloService.batchDecay(ids, LIMITS.ELO_INACTIVE_EXTENDED);
    decayed += count;
  }

  // Regular inactive (3-14 days): -5/day
  const regularInactive = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      lastActiveAt: { lt: threeDaysAgo, gte: fourteenDaysAgo },
      eloScore: { gt: LIMITS.ELO_MIN },
    },
    select: { id: true },
  });

  if (regularInactive.length > 0) {
    const ids = regularInactive.map((u) => u.id);
    const count = await eloService.batchDecay(ids, LIMITS.ELO_INACTIVE_DAILY);
    decayed += count;
  }

  // Rebuild Redis sorted sets for all cities
  let rebuilt = 0;
  for (const city of CITIES) {
    try {
      const count = await eloService.rebuildRedisSet(city);
      rebuilt += count;
    } catch (err) {
      console.error(`Redis rebuild failed for ${city}:`, err);
    }
  }

  if (decayed > 0 || rebuilt > 0) {
    console.log(`📉 ELO decay: ${decayed} users decayed, ${rebuilt} Redis entries rebuilt`);
  }

  return { decayed, rebuilt };
}
