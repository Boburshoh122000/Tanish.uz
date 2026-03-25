import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { premiumService } from '../index.js';
import { LIMITS } from '@tanish/shared';

export async function premiumRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // GET /api/premium/status — get premium status
  app.get('/status', async (request, reply) => {
    const userId = (request as any).userId;

    try {
      const status = await premiumService!.getStatus(userId);
      return reply.send({ success: true, data: status });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // POST /api/premium/create-invoice — generate Telegram Stars invoice
  app.post('/create-invoice', async (request, reply) => {
    const userId = (request as any).userId;
    const { promo } = (request.body as { promo?: boolean }) || {};

    try {
      const invoiceLink = await premiumService!.createInvoice(userId, promo);
      return reply.send({ success: true, data: { invoiceLink } });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // GET /api/premium/comparison — free vs premium features
  app.get('/comparison', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        free: {
          dailyMatches: LIMITS.FREE_DAILY_MATCHES,
          dailyIntros: LIMITS.FREE_DAILY_INTROS,
          seeWhoLikesYou: false,
          profileBoost: false,
          priorityMatching: false,
          premiumBadge: false,
        },
        premium: {
          dailyMatches: LIMITS.PREMIUM_DAILY_MATCHES,
          dailyIntros: LIMITS.PREMIUM_DAILY_INTROS,
          seeWhoLikesYou: true,
          profileBoost: true,
          priorityMatching: true,
          premiumBadge: true,
        },
      },
    });
  });

  // GET /api/premium/who-likes-me — see who sent intros (premium only)
  app.get('/who-likes-me', async (request, reply) => {
    const userId = (request as any).userId;

    // Check premium status
    const status = await premiumService!.getStatus(userId);
    if (!status.isPremium) {
      return reply.status(403).send({
        success: false,
        error: 'Premium feature. Upgrade to see who likes you!',
      });
    }

    const { prisma } = await import('../index.js');

    const intros = await prisma.intro.findMany({
      where: {
        receiverId: userId,
        status: 'PENDING',
      },
      include: {
        sender: {
          select: {
            id: true, firstName: true, lastName: true,
            currentRole: true, verified: true, birthDate: true,
            photos: { take: 1, orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = intros.map((intro) => ({
      introId: intro.id,
      sender: {
        ...intro.sender,
        age: Math.floor(
          (Date.now() - new Date(intro.sender.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        ),
      },
      question: intro.question,
      senderAnswer: intro.senderAnswer,
      expiresAt: intro.expiresAt,
    }));

    return reply.send({ success: true, data: mapped });
  });
}
