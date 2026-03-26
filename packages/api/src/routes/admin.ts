import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma, tracker } from '../index.js';
import { EVENT_TYPES } from '@tanish/shared';

const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

/**
 * Admin middleware — checks if user's telegramId is in ADMIN_TELEGRAM_IDS.
 */
async function adminMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ success: false, error: 'Missing authorization' });
  }

  const { verifyToken } = await import('../auth/index.js');
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return reply.status(401).send({ success: false, error: 'Invalid token' });
  }

  if (!ADMIN_IDS.includes(payload.telegramId)) {
    return reply.status(403).send({ success: false, error: 'Admin access required' });
  }

  (request as any).userId = payload.userId;
  (request as any).telegramId = payload.telegramId;
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', adminMiddleware);

  // GET /api/admin/metrics — daily metrics for date range
  app.get('/metrics', async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };

    const where: any = {};
    if (from) where.date = { ...where.date, gte: new Date(from) };
    if (to) where.date = { ...where.date, lte: new Date(to) };

    const metrics = await prisma.dailyMetrics.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 90,
    });

    // Computed fields
    const enriched = metrics.map((m) => ({
      ...m,
      matchRate: m.introsSent > 0 ? Math.round((m.matchesCreated / m.introsSent) * 100) : 0,
      responseRate: m.introsSent > 0 ? Math.round((m.introsAnswered / m.introsSent) * 100) : 0,
      genderRatio: m.activeFemales > 0
        ? Math.round((m.activeMales / m.activeFemales) * 100) / 100
        : null,
      premiumConversion: m.premiumViews > 0
        ? Math.round((m.premiumPurchases / m.premiumViews) * 100)
        : 0,
    }));

    return reply.send({ success: true, data: enriched });
  });

  // GET /api/admin/stats — live stats summary
  app.get('/stats', async (_request, reply) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeToday,
      newSignupsToday,
      pendingReports,
      matchesToday,
      introsSentToday,
      premiumUsers,
      genderCounts,
    ] = await Promise.all([
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.event.groupBy({
        by: ['userId'],
        where: { type: EVENT_TYPES.APP_OPEN, createdAt: { gte: today } },
      }).then((r) => r.length),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.event.count({ where: { type: EVENT_TYPES.MATCH_CREATED, createdAt: { gte: today } } }),
      prisma.event.count({ where: { type: EVENT_TYPES.INTRO_SENT, createdAt: { gte: today } } }),
      prisma.user.count({ where: { isPremium: true } }),
      prisma.user.groupBy({
        by: ['gender'],
        where: { status: 'ACTIVE', profileComplete: true },
        _count: true,
      }),
    ]);

    const males = genderCounts.find((g) => g.gender === 'MALE')?._count || 0;
    const females = genderCounts.find((g) => g.gender === 'FEMALE')?._count || 0;

    return reply.send({
      success: true,
      data: {
        totalUsers,
        dau: activeToday,
        newSignupsToday,
        pendingReports,
        matchesToday,
        introsSentToday,
        premiumUsers,
        genderRatio: females > 0 ? Math.round((males / females) * 100) / 100 : null,
        activeMales: males,
        activeFemales: females,
      },
    });
  });

  // GET /api/admin/reports — pending reports queue
  app.get('/reports', async (request, reply) => {
    const { status } = request.query as { status?: string };

    const reports = await prisma.report.findMany({
      where: { status: (status as any) || 'PENDING' },
      include: {
        reporter: {
          select: { id: true, firstName: true, username: true },
        },
        reported: {
          select: {
            id: true, firstName: true, username: true,
            reportCount: true, status: true, verified: true,
            photos: { take: 1, orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reply.send({ success: true, data: reports });
  });

  // PATCH /api/admin/reports/:id — action a report
  app.patch('/reports/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { action } = request.body as { action: 'dismiss' | 'warn' | 'ban' };

    const report = await prisma.report.findUnique({
      where: { id },
      select: { reportedId: true },
    });
    if (!report) {
      return reply.status(404).send({ success: false, error: 'Report not found' });
    }

    switch (action) {
      case 'dismiss':
        await prisma.report.update({
          where: { id },
          data: { status: 'DISMISSED' },
        });
        // Reduce report count
        await prisma.user.update({
          where: { id: report.reportedId },
          data: { reportCount: { decrement: 1 } },
        });
        break;

      case 'warn':
        await prisma.report.update({
          where: { id },
          data: { status: 'ACTIONED' },
        });
        break;

      case 'ban':
        await prisma.report.update({
          where: { id },
          data: { status: 'ACTIONED' },
        });
        await prisma.user.update({
          where: { id: report.reportedId },
          data: { status: 'BANNED' },
        });
        break;
    }

    return reply.send({ success: true, data: { action, reportId: id } });
  });

  // POST /api/admin/users/:id/unsuspend — unsuspend a user
  app.post('/users/:id/unsuspend', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', reportCount: 0 },
    });

    return reply.send({ success: true, data: { unsuspended: true } });
  });

  // POST /api/admin/users/:id/ban — ban a user
  app.post('/users/:id/ban', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.user.update({
      where: { id },
      data: { status: 'BANNED' },
    });

    return reply.send({ success: true, data: { banned: true } });
  });

  // GET /api/admin/verifications — pending photo verifications
  app.get('/verifications', async (_request, reply) => {
    // For MVP: users who requested verification (verified = false, has verification event)
    const pending = await prisma.event.findMany({
      where: { type: EVENT_TYPES.VERIFICATION_REQUESTED },
      select: {
        userId: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true, firstName: true, username: true,
            verified: true,
            photos: { orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Filter to only unverified users
    const filtered = pending.filter((p) => !p.user.verified);

    return reply.send({ success: true, data: filtered });
  });

  // PATCH /api/admin/verifications/:userId — approve/reject verification
  app.patch('/verifications/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { approved } = request.body as { approved: boolean };

    if (approved) {
      await prisma.user.update({
        where: { id: userId },
        data: { verified: true },
      });

      // ELO boost
      const { eloService } = await import('../index.js');
      const { LIMITS } = await import('@tanish/shared');
      await eloService.adjustScore(userId, 'profile_verified', LIMITS.ELO_PROFILE_VERIFIED);
    }

    tracker.track(EVENT_TYPES.VERIFICATION_REVIEWED, userId, { approved });

    return reply.send({ success: true, data: { userId, approved } });
  });
}
