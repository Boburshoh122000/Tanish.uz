import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma, eloService, tracker } from '../index.js';
import { createReportSchema, LIMITS, EVENT_TYPES } from '@tanish/shared';
import { filterContent } from '../services/content-filter.js';

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // POST /api/reports/create
  app.post('/create', async (request, reply) => {
    const userId = request.userId;
    const body = createReportSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid report data',
        details: body.error.flatten(),
      });
    }

    const { reportedId, reason } = body.data;
    const details = body.data.details ? filterContent(body.data.details).text : undefined;

    if (userId === reportedId) {
      return reply.status(400).send({ success: false, error: 'Cannot report yourself' });
    }

    // Check daily report limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayReports = await prisma.report.count({
      where: { reporterId: userId, createdAt: { gte: todayStart } },
    });

    if (todayReports >= LIMITS.MAX_REPORTS_PER_DAY) {
      return reply.status(429).send({ success: false, error: 'Daily report limit reached' });
    }

    // Create report
    const report = await prisma.report.create({
      data: { reporterId: userId, reportedId, reason, details },
    });

    // Increment report count on reported user
    const reportedUser = await prisma.user.update({
      where: { id: reportedId },
      data: {
        reportCount: { increment: 1 },
      },
    });

    // ELO penalty via service (handles clamping + Redis sync)
    await eloService.adjustScore(reportedId, 'reported', LIMITS.ELO_REPORTED);

    // Auto-suspend if threshold reached
    if (reportedUser.reportCount >= LIMITS.AUTO_SUSPEND_REPORT_THRESHOLD) {
      await prisma.user.update({
        where: { id: reportedId },
        data: { status: 'SUSPENDED' },
      });
    }

    // Track event
    tracker.track(EVENT_TYPES.REPORT_SUBMITTED, userId, { reportedId, reason });

    return reply.send({
      success: true,
      message: 'Report submitted. We\'ll review it.',
    });
  });
}
