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

    // Check if this user already reported this person (prevent multi-report abuse)
    const existingReport = await prisma.report.findFirst({
      where: { reporterId: userId, reportedId },
    });
    if (existingReport) {
      return reply.status(409).send({ success: false, error: 'You have already reported this user' });
    }

    // Create report
    const report = await prisma.report.create({
      data: { reporterId: userId, reportedId, reason, details },
    });

    // Count unique reporters (not total reports) for auto-suspension
    const uniqueReporterCount = await prisma.report.groupBy({
      by: ['reporterId'],
      where: { reportedId },
    });

    // Update reportCount to reflect unique reporters
    await prisma.user.update({
      where: { id: reportedId },
      data: { reportCount: uniqueReporterCount.length },
    });

    // ELO penalty via service (handles clamping + Redis sync)
    await eloService.adjustScore(reportedId, 'reported', LIMITS.ELO_REPORTED);

    // Auto-suspend if threshold reached (3 unique reporters)
    if (uniqueReporterCount.length >= LIMITS.AUTO_SUSPEND_REPORT_THRESHOLD) {
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
