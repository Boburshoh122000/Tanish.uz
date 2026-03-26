import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma, eloService, notificationService, tracker } from '../index.js';
import { createIntroSchema, respondIntroSchema, LIMITS, EVENT_TYPES } from '@tanish/shared';
import { generateIcebreaker } from '../services/icebreaker.js';
import { filterIntroAnswer } from '../services/content-filter.js';

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://tanish.uz';

export async function introRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // POST /api/intros/create — send an intro
  app.post('/create', async (request, reply) => {
    const userId = (request as any).userId;
    const body = createIntroSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request',
        details: body.error.flatten(),
      });
    }

    const { receiverId, answer } = body.data;

    // Validations
    if (userId === receiverId) {
      return reply.status(400).send({ success: false, error: 'Cannot send intro to yourself' });
    }

    // Check if receiver exists and is active
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId, status: 'ACTIVE' },
      select: { id: true, telegramId: true, firstName: true },
    });
    if (!receiver) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    // Check for existing active intro
    const existingIntro = await prisma.intro.findUnique({
      where: { senderId_receiverId: { senderId: userId, receiverId } },
    });
    if (existingIntro && ['PENDING', 'MATCHED'].includes(existingIntro.status)) {
      return reply.status(409).send({ success: false, error: 'Active intro already exists' });
    }

    // Check if blocked (bidirectional)
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: userId },
        ],
      },
    });
    if (block) {
      return reply.status(403).send({ success: false, error: 'Cannot send intro to this user' });
    }

    // Check daily intro limit
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPremium: true, firstName: true },
    });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayIntros = await prisma.intro.count({
      where: { senderId: userId, createdAt: { gte: todayStart } },
    });

    const limit = user!.isPremium ? LIMITS.PREMIUM_DAILY_INTROS : LIMITS.FREE_DAILY_INTROS;
    if (todayIntros >= limit) {
      return reply.status(429).send({
        success: false,
        error: `Daily intro limit reached (${limit}).${!user!.isPremium ? ' Upgrade to Premium for more!' : ''}`,
      });
    }

    // Filter the answer content
    const filtered = filterIntroAnswer(answer);
    if (filtered.flagged) {
      // Log flagged content for admin review but allow through
      tracker.track(EVENT_TYPES.CONTENT_FLAGGED, userId, {
        context: 'intro_answer',
        flags: filtered.flags,
      });
    }

    // Generate icebreaker question
    const question = await generateIcebreaker(userId, receiverId);

    // Create intro
    const intro = await prisma.intro.create({
      data: {
        senderId: userId,
        receiverId,
        question,
        senderAnswer: filtered.text,
        expiresAt: new Date(Date.now() + LIMITS.INTRO_EXPIRY_HOURS * 60 * 60 * 1000),
      },
    });

    // Track events
    tracker.trackMany([
      { type: EVENT_TYPES.INTRO_SENT, userId, metadata: { receiverId, introId: intro.id, questionText: question } },
      { type: EVENT_TYPES.INTRO_RECEIVED, userId: receiverId, metadata: { senderId: userId, introId: intro.id } },
    ]);

    // ELO boost for receiver (they're desirable)
    await eloService.adjustScore(receiverId, 'intro_received', LIMITS.ELO_INTRO_RECEIVED);

    // 🔔 Notify receiver
    if (notificationService) {
      await notificationService.notifyNewIntro(
        receiverId,
        Number(receiver.telegramId),
        user!.firstName,
        filtered.text,
        WEBAPP_URL
      );
    }

    return reply.send({
      success: true,
      data: { introId: intro.id, question },
    });
  });

  // POST /api/intros/:id/respond — respond to an intro
  app.post('/:id/respond', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params as { id: string };
    const body = respondIntroSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request',
        details: body.error.flatten(),
      });
    }

    const intro = await prisma.intro.findUnique({
      where: { id },
      include: {
        sender: { select: { id: true, username: true, firstName: true, telegramId: true } },
        receiver: { select: { id: true, username: true, firstName: true, telegramId: true } },
      },
    });

    if (!intro) {
      return reply.status(404).send({ success: false, error: 'Intro not found' });
    }

    if (intro.receiverId !== userId) {
      return reply.status(403).send({ success: false, error: 'Not your intro to respond to' });
    }

    if (intro.status !== 'PENDING') {
      return reply.status(400).send({ success: false, error: 'Intro is no longer pending' });
    }

    // DECLINE
    if (body.data.decline) {
      await prisma.intro.update({
        where: { id },
        data: { status: 'EXPIRED' }, // "EXPIRED" hides that it was declined
      });

      const declineResponseHours = (Date.now() - new Date(intro.createdAt).getTime()) / 3600000;
      tracker.track(EVENT_TYPES.INTRO_DECLINED, userId, { introId: id, responseTimeHours: Math.round(declineResponseHours * 10) / 10 });

      // Slight ELO penalty for sender (their intro didn't land)
      await eloService.adjustScore(intro.senderId, 'intro_declined', LIMITS.ELO_INTRO_DECLINED);

      return reply.send({ success: true, data: { status: 'declined' } });
    }

    // ANSWER — create match
    const answerText = body.data.answer!;
    const filtered = filterIntroAnswer(answerText);

    if (filtered.flagged) {
      tracker.track(EVENT_TYPES.CONTENT_FLAGGED, userId, { context: 'intro_response', flags: filtered.flags });
    }

    const updatedIntro = await prisma.intro.update({
      where: { id },
      data: {
        receiverAnswer: filtered.text,
        status: 'MATCHED',
        chatUnlocked: true,
      },
    });

    // Track events
    const answerResponseHours = (Date.now() - new Date(intro.createdAt).getTime()) / 3600000;
    tracker.trackMany([
      { type: EVENT_TYPES.INTRO_ANSWERED, userId, metadata: { introId: id, responseTimeHours: Math.round(answerResponseHours * 10) / 10 } },
      { type: EVENT_TYPES.MATCH_CREATED, userId: intro.senderId, metadata: { matchedUserId: userId } },
      { type: EVENT_TYPES.MATCH_CREATED, userId, metadata: { matchedUserId: intro.senderId } },
    ]);

    // ELO boost for both
    await Promise.all([
      eloService.adjustScore(userId, 'match_created', LIMITS.ELO_MATCH_CREATED),
      eloService.adjustScore(intro.senderId, 'match_created', LIMITS.ELO_MATCH_CREATED),
    ]);

    // 🔔 Notify BOTH users about the match
    if (notificationService) {
      // Notify sender
      await notificationService.notifyMatch(
        intro.senderId,
        Number(intro.sender.telegramId),
        intro.receiver.firstName,
        intro.receiver.username,
        WEBAPP_URL
      );

      // Notify receiver (current user)
      await notificationService.notifyMatch(
        userId,
        Number(intro.receiver.telegramId),
        intro.sender.firstName,
        intro.sender.username,
        WEBAPP_URL
      );
    }

    return reply.send({
      success: true,
      data: {
        status: 'matched',
        introId: updatedIntro.id,
        chatLink: intro.sender.username ? `https://t.me/${intro.sender.username}` : null,
      },
    });
  });

  // GET /api/intros/pending — pending intros for current user (as receiver)
  app.get('/pending', async (request, reply) => {
    const userId = (request as any).userId;

    const intros = await prisma.intro.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: {
        sender: {
          select: {
            id: true, firstName: true, lastName: true, currentRole: true,
            verified: true, birthDate: true,
            photos: { orderBy: { position: 'asc' } },
            interests: { include: { interest: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ success: true, data: intros });
  });

  // GET /api/intros/matched — all matches
  app.get('/matched', async (request, reply) => {
    const userId = (request as any).userId;

    const intros = await prisma.intro.findMany({
      where: {
        status: 'MATCHED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: {
          select: {
            id: true, firstName: true, lastName: true, username: true,
            currentRole: true, verified: true,
            photos: { take: 1, orderBy: { position: 'asc' } },
          },
        },
        receiver: {
          select: {
            id: true, firstName: true, lastName: true, username: true,
            currentRole: true, verified: true,
            photos: { take: 1, orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = intros.map((intro) => {
      const otherUser = intro.senderId === userId ? intro.receiver : intro.sender;
      return {
        id: intro.id,
        question: intro.question,
        myAnswer: intro.senderId === userId ? intro.senderAnswer : intro.receiverAnswer,
        theirAnswer: intro.senderId === userId ? intro.receiverAnswer : intro.senderAnswer,
        otherUser,
        chatLink: otherUser.username ? `https://t.me/${otherUser.username}` : null,
        createdAt: intro.createdAt,
      };
    });

    return reply.send({ success: true, data: mapped });
  });

  // GET /api/intros/sent — intros I sent (to see status)
  app.get('/sent', async (request, reply) => {
    const userId = (request as any).userId;

    const intros = await prisma.intro.findMany({
      where: { senderId: userId },
      include: {
        receiver: {
          select: {
            id: true, firstName: true, lastName: true,
            currentRole: true, verified: true,
            photos: { take: 1, orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return reply.send({ success: true, data: intros });
  });
}
