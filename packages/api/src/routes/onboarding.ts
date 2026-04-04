import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma, eloService, tracker } from '../index.js';
import { onboardingSchema, LIMITS, EVENT_TYPES } from '@tanish/shared';
import { filterContent } from '../services/content-filter.js';
import { creditReferral } from './referrals.js';
import { getUserBadges } from '../utils/badges.js';

export async function onboardingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // POST /api/onboarding/complete — submit onboarding data
  app.post('/complete', async (request, reply) => {
    const userId = request.userId;
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
        tracker.track(EVENT_TYPES.CONTENT_FLAGGED, userId, {
          context: 'onboarding_bio',
          flags: filtered.flags,
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

    // Set interests (atomic delete + create)
    await prisma.$transaction([
      prisma.userInterest.deleteMany({ where: { userId } }),
      prisma.userInterest.createMany({
        data: interestIds.map((interestId) => ({ userId, interestId })),
      }),
    ]);

    // Track event
    const referralCode = (request.query as { ref?: string })?.ref;
    tracker.track(EVENT_TYPES.ONBOARDING_COMPLETE, userId, {
      interestCount: interestIds.length,
      hasBio: !!cleanBio,
      hasUniversity: !!userData.university,
      hasWorkplace: !!userData.workplace,
      ...(referralCode ? { referralCode } : {}),
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
      data: {
        ...updatedUser,
        telegramId: updatedUser!.telegramId.toString(),
        interests: updatedUser!.interests.map((ui: { interest: unknown }) => ui.interest),
        badges: getUserBadges(updatedUser!),
      },
    });
  });
}
