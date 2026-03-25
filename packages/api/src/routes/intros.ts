import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma } from '../index.js';
import { createIntroSchema, respondIntroSchema, LIMITS } from '@tanish/shared';
import { generateIcebreaker } from '../services/icebreaker.js';

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

    // Check if blocked
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
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayIntros = await prisma.intro.count({
      where: { senderId: userId, createdAt: { gte: todayStart } },
    });

    const limit = user!.isPremium ? LIMITS.PREMIUM_DAILY_INTROS : LIMITS.FREE_DAILY_INTROS;
    if (todayIntros >= limit) {
      return reply.status(429).send({
        success: false,
        error: `Daily intro limit reached (${limit}). ${!user!.isPremium ? 'Upgrade to Premium for more!' : ''}`,
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
        senderAnswer: answer,
        expiresAt: new Date(Date.now() + LIMITS.INTRO_EXPIRY_HOURS * 60 * 60 * 1000),
      },
      include: {
        sender: {
          select: { id: true, firstName: true, photos: { take: 1, orderBy: { position: 'asc' } } },
        },
      },
    });

    // Track events
    await prisma.event.createMany({
      data: [
        { userId, type: 'intro_sent', metadata: { receiverId } },
        { userId: receiverId, type: 'intro_received', metadata: { senderId: userId } },
      ],
    });

    // ELO boost for receiver
    await prisma.user.update({
      where: { id: receiverId },
      data: { eloScore: { increment: LIMITS.ELO_INTRO_RECEIVED } },
    });

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
      include: { sender: true, receiver: true },
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

    if (body.data.decline) {
      // Decline silently
      await prisma.intro.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });

      await prisma.event.create({
        data: { userId, type: 'intro_declined', metadata: { introId: id } },
      });

      // Slight ELO penalty for sender
      await prisma.user.update({
        where: { id: intro.senderId },
        data: { eloScore: { increment: LIMITS.ELO_INTRO_DECLINED } },
      });

      return reply.send({ success: true, message: 'Intro declined' });
    }

    // Answer — create match
    const updatedIntro = await prisma.intro.update({
      where: { id },
      data: {
        receiverAnswer: body.data.answer,
        status: 'MATCHED',
        chatUnlocked: true,
      },
    });

    // Track events
    await prisma.event.createMany({
      data: [
        { userId, type: 'intro_answered', metadata: { introId: id } },
        { userId: intro.senderId, type: 'match_created', metadata: { matchedUserId: userId } },
        { userId, type: 'match_created', metadata: { matchedUserId: intro.senderId } },
      ],
    });

    // ELO boost for both
    await prisma.user.updateMany({
      where: { id: { in: [userId, intro.senderId] } },
      data: { eloScore: { increment: LIMITS.ELO_MATCH_CREATED } },
    });

    return reply.send({
      success: true,
      data: {
        ...updatedIntro,
        senderUsername: intro.sender.username,
        receiverUsername: intro.receiver.username,
        chatLink: intro.sender.username ? `https://t.me/${intro.sender.username}` : null,
      },
    });
  });

  // GET /api/intros/pending — get pending intros for current user
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

  // GET /api/intros/matched — get matched intros
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

    // Map to show "other" user
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
}
