import type { PrismaClient } from '@prisma/client';

/**
 * Expire stale intros — set PENDING intros past their expiresAt to EXPIRED.
 * Intended to be called hourly by cron.
 *
 * Returns the number of intros expired.
 */
export async function expireStaleIntros(prisma: PrismaClient): Promise<number> {
  const result = await prisma.intro.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });

  if (result.count > 0) {
    console.log(`[intro-expiry] Expired ${result.count} stale intros`);
  }

  return result.count;
}
