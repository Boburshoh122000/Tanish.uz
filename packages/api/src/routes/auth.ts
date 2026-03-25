import type { FastifyInstance } from 'fastify';
import { validateInitData, createToken } from '../auth/index.js';
import { prisma } from '../index.js';
import { telegramAuthSchema } from '@tanish/shared';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/telegram — authenticate via Telegram initData
  app.post('/telegram', async (request, reply) => {
    const body = telegramAuthSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.flatten(),
      });
    }

    const telegramUser = validateInitData(body.data.initData);
    if (!telegramUser) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid Telegram initData',
      });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUser.id) },
      include: {
        photos: { orderBy: { position: 'asc' } },
        interests: { include: { interest: true } },
      },
    });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramUser.id),
          username: telegramUser.username || null,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name || null,
          gender: 'MALE', // Will be set during onboarding
          birthDate: new Date('2000-01-01'), // Placeholder — set during onboarding
          preferredLanguage: telegramUser.language_code === 'uz' ? 'UZBEK'
            : telegramUser.language_code === 'ru' ? 'RUSSIAN'
            : 'ENGLISH',
        },
        include: {
          photos: { orderBy: { position: 'asc' } },
          interests: { include: { interest: true } },
        },
      });

      // Track event
      await prisma.event.create({
        data: {
          userId: user.id,
          type: 'app_open',
          metadata: { isNewUser: true },
        },
      });
    } else {
      // Update username if changed
      if (telegramUser.username && telegramUser.username !== user.username) {
        await prisma.user.update({
          where: { id: user.id },
          data: { username: telegramUser.username },
        });
      }

      // Track event
      await prisma.event.create({
        data: {
          userId: user.id,
          type: 'app_open',
        },
      });
    }

    const token = createToken(user.id, user.telegramId);

    return reply.send({
      success: true,
      data: {
        token,
        user: {
          ...user,
          telegramId: user.telegramId.toString(),
        },
        isNewUser,
        onboardingComplete: user.profileComplete,
      },
    });
  });
}
