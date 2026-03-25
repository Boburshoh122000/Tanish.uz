import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma, eloService } from '../index.js';
import { onboardingSchema, LIMITS } from '@tanish/shared';
import { filterContent } from '../services/content-filter.js';
import { creditReferral } from './referrals.js';

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

    // Filter bio content
    let cleanBio = userData.bio;
    if (cleanBio) {
      const filtered = filterContent(cleanBio);
      cleanBio = filtered.text;
      if (filtered.flagged) {
        await prisma.event.create({
          data: {
            userId,
            type: 'content_flagged',
            metadata: { context: 'onboarding_bio', flags: filtered.flags },
          },
        });
      }
    }

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
        bio: cleanBio,
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

    // ELO boost for completing profile
    await eloService.adjustScore(userId, 'profile_complete', LIMITS.ELO_PROFILE_COMPLETE);

    // Credit referral if user came via referral link
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    });
    // referredById is set by the bot /start handler when ref_ param is present
    // But if it was stored as a referralCode in metadata, handle it here
    const referralCode = (request.query as any)?.ref;
    if (referralCode && !currentUser?.referredById) {
      await creditReferral(userId, referralCode);
    }

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
