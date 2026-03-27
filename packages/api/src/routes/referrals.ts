import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { authMiddleware } from '../auth/index.js';
import { prisma, tracker } from '../index.js';
import { EVENT_TYPES } from '@tanish/shared';

export async function referralRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // GET /api/referrals/link — get or create referral link
  app.get('/link', async (request, reply) => {
    const userId = request.userId;

    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    // Generate referral code if doesn't exist
    if (!user.referralCode) {
      const code = crypto.randomBytes(4).toString('hex'); // 8 char hex
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      user = { referralCode: code };
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'TanishBot';
    const link = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;

    return reply.send({
      success: true,
      data: { code: user.referralCode, link },
    });
  });

  // GET /api/referrals/stats — referral statistics
  app.get('/stats', async (request, reply) => {
    const userId = request.userId;

    const referralCount = await prisma.user.count({
      where: { referredById: userId },
    });

    const completedReferrals = await prisma.user.count({
      where: { referredById: userId, profileComplete: true },
    });

    // Referral events
    const events = await prisma.event.findMany({
      where: {
        userId,
        type: EVENT_TYPES.REFERRAL_CREDIT,
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return reply.send({
      success: true,
      data: {
        totalReferred: referralCount,
        completedSignups: completedReferrals,
        bonusMatchesEarned: completedReferrals, // 1 bonus per completed referral
        recentCredits: events,
      },
    });
  });
}

/**
 * Process a referral when a new user completes onboarding.
 * Called from onboarding route.
 */
export async function creditReferral(
  newUserId: string,
  referralCode: string
): Promise<boolean> {
  try {
    // Find the referrer by code
    const referrer = await prisma.user.findUnique({
      where: { referralCode: referralCode },
      select: { id: true },
    });

    if (!referrer || referrer.id === newUserId) return false;

    // Link the new user to the referrer
    await prisma.user.update({
      where: { id: newUserId },
      data: { referredById: referrer.id },
    });

    // Track events for both users
    tracker.trackMany([
      { type: EVENT_TYPES.REFERRAL_CREDIT, userId: referrer.id, metadata: { referredUserId: newUserId } },
      { type: EVENT_TYPES.REFERRAL_USED, userId: newUserId, metadata: { referrerId: referrer.id } },
    ]);

    console.log(`🎁 Referral credited: ${referrer.id} referred ${newUserId}`);
    return true;
  } catch (err) {
    console.error('Referral credit failed:', err);
    return false;
  }
}
