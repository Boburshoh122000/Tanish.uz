import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma, bot, tracker } from '../index.js';
import { EVENT_TYPES, LIMITS, PREMIUM_DURATION_DAYS } from '@tanish/shared';

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

  request.userId = payload.userId;
  request.telegramId = BigInt(payload.telegramId);
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
      activeNow,
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
      prisma.user.count({ where: { lastActiveAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } }),
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
        activeNow,
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
    const { action } = request.body as { action: 'dismiss' | 'warn' | 'suspend' | 'ban' };

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

      case 'suspend':
        await prisma.report.update({
          where: { id },
          data: { status: 'ACTIONED' },
        });
        await prisma.user.update({
          where: { id: report.reportedId },
          data: { status: 'SUSPENDED' },
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

  // GET /api/admin/users/:telegramId — look up user by Telegram ID
  app.get('/users/:telegramId', async (request, reply) => {
    const { telegramId } = request.params as { telegramId: string };

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      include: {
        photos: { orderBy: { position: 'asc' } },
        interests: { include: { interest: true } },
      },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    return reply.send({
      success: true,
      data: {
        ...user,
        telegramId: user.telegramId.toString(),
        interests: user.interests.map((ui: { interest: unknown }) => ui.interest),
      },
    });
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

  // GET /api/admin/verifications/pending — paginated pending verifications
  app.get('/verifications/pending', async (request, reply) => {
    const { page = '1', limit = '20' } = request.query as { page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    const [verifications, total] = await Promise.all([
      prisma.verification.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.verification.count({ where: { status: 'PENDING' } }),
    ]);

    const userIds = verifications.map((v) => v.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true, firstName: true, lastName: true, username: true,
        currentRole: true, verified: true, createdAt: true,
        photos: { orderBy: { position: 'asc' }, select: { url: true, position: true } },
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = verifications.map((v) => ({
      id: v.id,
      userId: v.userId,
      selfieUrl: v.selfieUrl,
      profilePhotoUrl: v.profilePhotoUrl,
      status: v.status,
      createdAt: v.createdAt,
      user: userMap.get(v.userId) ?? null,
    }));

    return reply.send({
      success: true,
      data: {
        items: enriched,
        total,
        page: pageNum,
        pageSize: limitNum,
        hasMore: pageNum * limitNum < total,
      },
    });
  });

  // PATCH /api/admin/verifications/:id — approve or reject
  app.patch('/verifications/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { approved, rejectionReason } = request.body as {
      approved: boolean;
      rejectionReason?: string;
    };

    const verification = await prisma.verification.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });

    if (!verification) {
      return reply.status(404).send({ success: false, error: 'Verification not found' });
    }

    if (verification.status !== 'PENDING') {
      return reply.status(400).send({ success: false, error: 'Verification already reviewed' });
    }

    const adminUserId = request.userId;

    if (approved) {
      await prisma.$transaction([
        prisma.verification.update({
          where: { id },
          data: { status: 'APPROVED', reviewedBy: adminUserId },
        }),
        prisma.user.update({
          where: { id: verification.userId },
          data: { verified: true },
        }),
      ]);

      const { eloService } = await import('../index.js');
      await eloService.adjustScore(
        verification.userId,
        'profile_verified',
        LIMITS.ELO_PROFILE_VERIFIED,
      );

      // Notify user
      const user = await prisma.user.findUnique({
        where: { id: verification.userId },
        select: { telegramId: true },
      });
      if (user) {
        const { bot } = await import('../index.js');
        try {
          await bot.api.sendMessage(
            Number(user.telegramId),
            '✅ Your profile has been verified! You now have a verified badge.',
          );
        } catch {
          // Notification failure is non-critical
        }
      }
    } else {
      await prisma.verification.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedBy: adminUserId,
          rejectionReason: rejectionReason || 'Photo did not match profile',
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: verification.userId },
        select: { telegramId: true },
      });
      if (user) {
        const { bot } = await import('../index.js');
        const reason = rejectionReason || 'Photo did not match profile';
        try {
          await bot.api.sendMessage(
            Number(user.telegramId),
            `❌ Verification not approved: ${reason}\n\nYou can try again with a clearer selfie.`,
          );
        } catch {
          // Notification failure is non-critical
        }
      }
    }

    tracker.track(EVENT_TYPES.VERIFICATION_REVIEWED, verification.userId, { approved });

    return reply.send({
      success: true,
      data: { id, userId: verification.userId, approved },
    });
  });

  // ═══════════ User Management ═══════════

  // GET /api/admin/users — paginated, searchable user list
  app.get('/users', async (request, reply) => {
    const { page = '1', limit = '20', search, status, isPremium } =
      request.query as { page?: string; limit?: string; search?: string; status?: string; isPremium?: string };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    const where: any = {};
    if (status) where.status = status;
    if (isPremium === 'true') where.isPremium = true;
    if (isPremium === 'false') where.isPremium = false;

    if (search) {
      const isNumeric = /^\d+$/.test(search);
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        ...(isNumeric ? [{ telegramId: BigInt(search) }] : []),
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, telegramId: true, firstName: true, lastName: true, username: true,
          gender: true, status: true, isPremium: true, premiumUntil: true,
          verified: true, profileComplete: true, reportCount: true,
          createdAt: true, lastActiveAt: true,
          photos: { orderBy: { position: 'asc' as const }, select: { id: true, url: true, position: true, verified: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    const items = users.map((u) => ({
      ...u,
      telegramId: u.telegramId.toString(),
      photoCount: u.photos.length,
    }));

    return reply.send({
      success: true,
      data: { items, total, page: pageNum, pageSize: limitNum, hasMore: pageNum * limitNum < total },
    });
  });

  // GET /api/admin/users/detail/:userId — full user for investigation
  app.get('/users/detail/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        photos: { orderBy: { position: 'asc' } },
        interests: { include: { interest: true } },
      },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    const [reportCount, paymentCount, verifications] = await Promise.all([
      prisma.report.count({ where: { reportedId: userId } }),
      prisma.payment.count({ where: { userId } }),
      prisma.verification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, status: true, selfieUrl: true, profilePhotoUrl: true, rejectionReason: true, createdAt: true },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        ...user,
        telegramId: user.telegramId.toString(),
        interests: user.interests.map((ui: { interest: unknown }) => ui.interest),
        reportCount,
        paymentCount,
        verifications,
      },
    });
  });

  // POST /api/admin/users/:userId/grant-premium
  app.post('/users/:userId/grant-premium', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { durationDays, reason } = request.body as { durationDays: number; reason?: string };
    const adminUserId = request.userId;

    if (!durationDays || durationDays < 1 || durationDays > 365) {
      return reply.status(400).send({ success: false, error: 'durationDays must be 1-365' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, telegramId: true, isPremium: true, premiumUntil: true },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    // Extend from current premiumUntil if already premium, otherwise from now
    const baseDate = user.isPremium && user.premiumUntil && user.premiumUntil > new Date()
      ? user.premiumUntil
      : new Date();
    const premiumUntil = new Date(baseDate.getTime() + durationDays * 86400000);

    await prisma.user.update({
      where: { id: userId },
      data: { isPremium: true, premiumUntil },
    });

    await prisma.payment.create({
      data: {
        userId,
        amount: 0,
        transactionId: `admin_grant_${Date.now()}`,
        plan: 'admin_grant',
      },
    });

    await prisma.event.create({
      data: {
        userId,
        type: 'premium_granted',
        metadata: { grantedBy: adminUserId, durationDays, reason: reason || null },
      },
    });

    try {
      await bot.api.sendMessage(
        Number(user.telegramId),
        `🎁 You've been granted ${durationDays} days of Tanish Premium!`,
      );
    } catch { /* user may have blocked bot */ }

    return reply.send({ success: true, data: { userId, premiumUntil: premiumUntil.toISOString() } });
  });

  // POST /api/admin/users/:userId/revoke-premium
  app.post('/users/:userId/revoke-premium', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { reason } = (request.body as { reason?: string }) || {};
    const adminUserId = request.userId;

    await prisma.user.update({
      where: { id: userId },
      data: { isPremium: false, premiumUntil: null },
    });

    await prisma.event.create({
      data: {
        userId,
        type: 'premium_revoked',
        metadata: { revokedBy: adminUserId, reason: reason || null },
      },
    });

    return reply.send({ success: true });
  });

  // POST /api/admin/users/:userId/message — send Telegram message
  app.post('/users/:userId/message', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { text } = request.body as { text: string };
    const adminUserId = request.userId;

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({ success: false, error: 'Message text is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    try {
      await bot.api.sendMessage(Number(user.telegramId), text, { parse_mode: 'HTML' });

      await prisma.event.create({
        data: {
          userId,
          type: 'admin_message_sent',
          metadata: { sentBy: adminUserId },
        },
      });

      return reply.send({ success: true, data: { delivered: true } });
    } catch (err: any) {
      const blocked = err?.error_code === 403;
      return reply.send({
        success: true,
        data: { delivered: false, reason: blocked ? 'blocked' : 'send_failed' },
      });
    }
  });

  // PATCH /api/admin/users/:userId/status — change user status
  app.patch('/users/:userId/status', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { status } = request.body as { status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' };

    if (!['ACTIVE', 'SUSPENDED', 'BANNED'].includes(status)) {
      return reply.status(400).send({ success: false, error: 'Invalid status' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        status,
        ...(status === 'ACTIVE' ? { reportCount: 0 } : {}),
      },
    });

    return reply.send({ success: true, data: { userId, status } });
  });

  // POST /api/admin/broadcast — message all active users
  app.post('/broadcast', async (request, reply) => {
    const { text, confirm, filter } = request.body as {
      text: string;
      confirm?: boolean;
      filter?: { isPremium?: boolean; gender?: string };
    };
    const adminUserId = request.userId;

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({ success: false, error: 'Message text is required' });
    }

    const where: any = { status: 'ACTIVE', profileComplete: true };
    if (filter?.isPremium !== undefined) where.isPremium = filter.isPremium;
    if (filter?.gender) where.gender = filter.gender;

    const recipients = await prisma.user.findMany({
      where,
      select: { id: true, telegramId: true },
    });

    if (!confirm) {
      return reply.send({
        success: false,
        error: `This will be sent to ${recipients.length} users. Set confirm: true to send.`,
        data: { recipientCount: recipients.length },
      });
    }

    let delivered = 0;
    let failed = 0;

    for (const user of recipients) {
      try {
        await bot.api.sendMessage(Number(user.telegramId), text, { parse_mode: 'HTML' });
        delivered++;
      } catch {
        failed++;
      }
      // 50ms delay to stay under Telegram's 30 msg/s rate limit
      await new Promise((r) => setTimeout(r, 50));
    }

    await prisma.event.create({
      data: {
        userId: adminUserId,
        type: 'admin_broadcast',
        metadata: { totalRecipients: recipients.length, delivered, failed, filter: filter || null },
      },
    });

    return reply.send({ success: true, data: { total: recipients.length, delivered, failed } });
  });
}
