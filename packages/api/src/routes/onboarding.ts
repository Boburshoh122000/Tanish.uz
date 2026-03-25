import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma } from '../index.js';
import { onboardingSchema } from '@tanish/shared';

export async function onboardingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // POST /api/onboarding/complete — submit onboarding data
  app.post('/complete', async (request, reply) => {
    const userId = (request as any).userId;
    const body = onboardingSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid onboarding data',
        details: body.error.flatten(),
      });
    }

    const { interestIds, ...userData } = body.data;

    // Update user with onboarding data
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        gender: userData.gender,
        lookingFor: userData.lookingFor,
        city: userData.city,
        birthDate: new Date(userData.birthDate),
        currentRole: userData.currentRole,
        university: userData.university,
        workplace: userData.workplace,
        bio: userData.bio,
        languages: userData.languages,
        profileComplete: true,
      },
    });

    // Set interests
    await prisma.userInterest.deleteMany({ where: { userId } });
    await prisma.userInterest.createMany({
      data: interestIds.map((interestId) => ({ userId, interestId })),
    });

    // Track event
    await prisma.event.create({
      data: { userId, type: 'onboarding_complete' },
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        photos: { orderBy: { position: 'asc' } },
        interests: { include: { interest: true } },
      },
    });

    return reply.send({
      success: true,
      data: { ...updatedUser, telegramId: updatedUser!.telegramId.toString() },
    });
  });
}
