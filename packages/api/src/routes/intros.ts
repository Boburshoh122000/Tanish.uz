import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma, eloService, notificationService, tracker } from '../index.js';
import { createIntroSchema, respondIntroSchema, LIMITS, EVENT_TYPES } from '@tanish/shared';
import { generateQuestion } from '../services/icebreaker.service.js';
import { filterIntroAnswer } from '../services/content-filter.js';
import { getRedis } from '../services/redis.js';

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://tanish.uz';

export async function introRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // POST /api/intros/create — send an intro
  app.post('/create', async (request, reply) => {
    const userId = request.userId as string;
    const body = createIntroSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request',
        details: body.error.flatten(),
      });
    }

    const { receiverId, answer } = body.data;

    // 1. Cannot intro yourself
    if (userId === receiverId) {
      return reply.status(400).send({ success: false, error: 'Cannot send intro to yourself' });
    }

    // 2. Receiver must exist and be ACTIVE
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId, status: 'ACTIVE' },
      select: {
        id: true,
        telegramId: true,
        firstName: true,
        interests: {
          select: { interestId: true, interest: { select: { category: true } } },
        },
      },
    });
    if (!receiver) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    // 3. No existing active intro between them (bidirectional)
    const existingIntro = await prisma.intro.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId },
          { senderId: receiverId, receiverId: userId },
        ],
        status: { in: ['PENDING', 'MATCHED'] },
      },
    });
    if (existingIntro) {
      return reply.status(409).send({ success: false, error: 'Active intro already exists' });
    }

    // 4. Not blocked (bidirectional)
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

    // 5. Fetch sender (isPremium + interests)
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isPremium: true,
        firstName: true,
        interests: {
          select: { interestId: true, interest: { select: { category: true } } },
        },
      },
    });
    if (!sender) {
      return reply.status(401).send({ success: false, error: 'Sender not found' });
    }

    // 6. Check daily intro limit via Redis counter (Prisma fallback)
    const limit = sender.isPremium ? LIMITS.PREMIUM_DAILY_INTROS : LIMITS.FREE_DAILY_INTROS;
    const today = new Date().toISOString().slice(0, 10);
    const dailyKey = `intro:daily:${userId}:${today}`;

    let limitExceeded = false;
    try {
      const redis = getRedis();
      const count = await redis.incr(dailyKey);
      if (count === 1) {
        await redis.expire(dailyKey, 86400);
      }
      if (count > limit) {
        await redis.decr(dailyKey); // roll back the increment
        limitExceeded = true;
      }
    } catch {
      // Redis unavailable — fall back to Prisma count
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIntros = await prisma.intro.count({
        where: { senderId: userId, createdAt: { gte: todayStart } },
      });
      if (todayIntros >= limit) {
        limitExceeded = true;
      }
    }

    if (limitExceeded) {
      return reply.status(429).send({
        success: false,
        error: `Daily intro limit reached (${limit}).${!sender.isPremium ? ' Upgrade to Premium for more!' : ''}`,
      });
    }

    // 7. Filter the answer content
    const filtered = filterIntroAnswer(answer);
    if (filtered.flagged) {
      tracker.track(EVENT_TYPES.CONTENT_FLAGGED, userId, {
        context: 'intro_answer',
        flags: filtered.flags,
      });
    }

    // 8. Generate icebreaker question from shared interests
    const senderInterests = sender.interests.map((ui) => ({
      interestId: ui.interestId,
      category: ui.interest.category,
    }));
    const receiverInterests = receiver.interests.map((ui) => ({
      interestId: ui.interestId,
      category: ui.interest.category,
    }));

    const { question, category } = await generateQuestion(senderInterests, receiverInterests, userId);

    // 9. Create intro record
    const intro = await prisma.intro.create({
      data: {
        senderId: userId,
        receiverId,
        question,
        senderAnswer: filtered.text,
        expiresAt: new Date(Date.now() + LIMITS.INTRO_EXPIRY_HOURS * 60 * 60 * 1000),
      },
    });

    // 10. Track events
    tracker.trackMany([
      { type: EVENT_TYPES.INTRO_SENT, userId, metadata: { receiverId, introId: intro.id, questionText: question } },
      { type: EVENT_TYPES.INTRO_RECEIVED, userId: receiverId, metadata: { senderId: userId, introId: intro.id } },
    ]);

    // 11. ELO boost for receiver
    await eloService.adjustScore(receiverId, 'intro_received', LIMITS.ELO_INTRO_RECEIVED);

    // 12. Notify receiver
    if (notificationService) {
      await notificationService.notifyNewIntro(
        receiverId,
        Number(receiver.telegramId),
        sender.firstName,
        filtered.text,
        WEBAPP_URL,
      );
    }

    return reply.send({
      success: true,
      data: { introId: intro.id, question, category },
    });
  });

  // POST /api/intros/:id/respond — respond to an intro
  app.post('/:id/respond', async (request, reply) => {
    const userId = request.userId as string;
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
        sender: {
          select: {
            id: true, username: true, firstName: true, lastName: true,
            telegramId: true, currentRole: true, verified: true,
            photos: { take: 1, orderBy: { position: 'asc' } },
          },
        },
        receiver: {
          select: {
            id: true, username: true, firstName: true, lastName: true,
            telegramId: true, currentRole: true, verified: true,
            photos: { take: 1, orderBy: { position: 'asc' } },
          },
        },
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
        data: { status: 'EXPIRED' }, // silent — sender sees it as expired, not declined
      });

      const declineHours = (Date.now() - new Date(intro.createdAt).getTime()) / 3_600_000;
      tracker.track(EVENT_TYPES.INTRO_DECLINED, userId, {
        introId: id,
        responseTimeHours: Math.round(declineHours * 10) / 10,
      });

      await eloService.adjustScore(intro.senderId, 'intro_declined', LIMITS.ELO_INTRO_DECLINED);

      return reply.send({ success: true, data: { status: 'declined' } });
    }

    // ANSWER — create match
    const answerText = body.data.answer!;
    const filtered = filterIntroAnswer(answerText);

    if (filtered.flagged) {
      tracker.track(EVENT_TYPES.CONTENT_FLAGGED, userId, {
        context: 'intro_response',
        flags: filtered.flags,
      });
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
    const answerHours = (Date.now() - new Date(intro.createdAt).getTime()) / 3_600_000;
    tracker.trackMany([
      { type: EVENT_TYPES.INTRO_ANSWERED, userId, metadata: { introId: id, responseTimeHours: Math.round(answerHours * 10) / 10 } },
      { type: EVENT_TYPES.MATCH_CREATED, userId: intro.senderId, metadata: { matchedUserId: userId } },
      { type: EVENT_TYPES.MATCH_CREATED, userId, metadata: { matchedUserId: intro.senderId } },
    ]);

    // ELO boost for both
    await Promise.all([
      eloService.adjustScore(userId, 'match_created', LIMITS.ELO_MATCH_CREATED),
      eloService.adjustScore(intro.senderId, 'match_created', LIMITS.ELO_MATCH_CREATED),
    ]);

    // Notify both users
    if (notificationService) {
      await notificationService.notifyMatch(
        intro.senderId,
        Number(intro.sender.telegramId),
        intro.receiver.firstName,
        intro.receiver.username,
        WEBAPP_URL,
      );
      await notificationService.notifyMatch(
        userId,
        Number(intro.receiver.telegramId),
        intro.sender.firstName,
        intro.sender.username,
        WEBAPP_URL,
      );
    }

    return reply.send({
      success: true,
      data: {
        status: 'matched',
        introId: updatedIntro.id,
        sender: {
          id: intro.sender.id,
          firstName: intro.sender.firstName,
          lastName: intro.sender.lastName,
          username: intro.sender.username,
          currentRole: intro.sender.currentRole,
          verified: intro.sender.verified,
          photo: intro.sender.photos[0] ?? null,
          chatLink: intro.sender.username ? `https://t.me/${intro.sender.username}` : null,
        },
        receiver: {
          id: intro.receiver.id,
          firstName: intro.receiver.firstName,
          lastName: intro.receiver.lastName,
          username: intro.receiver.username,
          currentRole: intro.receiver.currentRole,
          verified: intro.receiver.verified,
          photo: intro.receiver.photos[0] ?? null,
          chatLink: intro.receiver.username ? `https://t.me/${intro.receiver.username}` : null,
        },
      },
    });
  });

  // GET /api/intros/pending — pending intros for current user (as receiver)
  app.get('/pending', async (request, reply) => {
    const userId = request.userId as string;

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

    // Enrich with sender age and shared interests
    const receiverInterestIds = await prisma.userInterest.findMany({
      where: { userId },
      select: { interestId: true },
    });
    const myInterestIds = new Set(receiverInterestIds.map((i) => i.interestId));

    const enriched = intros.map((intro) => {
      const age = Math.floor(
        (Date.now() - new Date(intro.sender.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );
      const sharedInterests = intro.sender.interests
        .filter((ui) => myInterestIds.has(ui.interestId))
        .map((ui) => ui.interest);

      return {
        id: intro.id,
        question: intro.question,
        senderAnswer: intro.senderAnswer,
        expiresAt: intro.expiresAt,
        createdAt: intro.createdAt,
        sender: {
          id: intro.sender.id,
          firstName: intro.sender.firstName,
          lastName: intro.sender.lastName,
          age,
          currentRole: intro.sender.currentRole,
          verified: intro.sender.verified,
          photos: intro.sender.photos,
          interests: intro.sender.interests.map((ui) => ui.interest),
          sharedInterests,
        },
      };
    });

    return reply.send({ success: true, data: enriched });
  });

  // GET /api/intros/matched — all matched intros
  app.get('/matched', async (request, reply) => {
    const userId = request.userId as string;

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
        otherUser: {
          ...otherUser,
          chatLink: otherUser.username ? `https://t.me/${otherUser.username}` : null,
        },
        createdAt: intro.createdAt,
      };
    });

    return reply.send({ success: true, data: mapped });
  });

  // GET /api/intros/sent — intros I sent (to see status)
  app.get('/sent', async (request, reply) => {
    const userId = request.userId as string;

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
