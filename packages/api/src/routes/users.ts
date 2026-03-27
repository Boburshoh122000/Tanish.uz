import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma, tracker } from '../index.js';
import { profileUpdateSchema, EVENT_TYPES } from '@tanish/shared';
import { filterContent } from '../services/content-filter.js';

export async function userRoutes(app: FastifyInstance) {
  // All user routes require auth
  app.addHook('onRequest', authMiddleware);

  // GET /api/users/me — get current user profile
  app.get('/me', async (request, reply) => {
    const userId = request.userId;

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

    return reply.send({
      success: true,
      data: { ...user, telegramId: user.telegramId.toString() },
    });
  });

  // PATCH /api/users/me — update current user profile
  app.patch('/me', async (request, reply) => {
    const userId = request.userId;
    const body = profileUpdateSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.flatten(),
      });
    }

    const { interestIds, ...updateData } = body.data;

    // Filter bio content if provided
    if (updateData.bio) {
      const filtered = filterContent(updateData.bio);
      updateData.bio = filtered.text;
      if (filtered.flagged) {
        tracker.track(EVENT_TYPES.CONTENT_FLAGGED, userId, {
          context: 'profile_bio',
          flags: filtered.flags,
        });
      }
    }

    // Update user fields
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        photos: { orderBy: { position: 'asc' } },
        interests: { include: { interest: true } },
      },
    });

    // Update interests if provided
    if (interestIds) {
      await prisma.userInterest.deleteMany({ where: { userId } });
      await prisma.userInterest.createMany({
        data: interestIds.map((interestId) => ({ userId, interestId })),
      });
    }

    // Recalculate profile completeness
    const profileScore = calculateProfileCompleteness(user);
    if (profileScore >= 0.85 && !user.profileComplete) {
      await prisma.user.update({
        where: { id: userId },
        data: { profileComplete: true },
      });
    }

    // Track event
    tracker.track(EVENT_TYPES.PROFILE_EDITED, userId, {
      fieldsChanged: Object.keys(updateData),
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

  // GET /api/users/:id — get public profile
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId;

    const user = await prisma.user.findUnique({
      where: { id, status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        lookingFor: true,
        birthDate: true,
        city: true,
        bio: true,
        currentRole: true,
        university: true,
        verified: true,
        isPremium: true,
        photos: { orderBy: { position: 'asc' } },
        interests: { include: { interest: true } },
      },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    // Calculate age
    const age = Math.floor(
      (Date.now() - new Date(user.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );

    // Find shared interests
    const viewerInterests = await prisma.userInterest.findMany({
      where: { userId },
      select: { interestId: true },
    });
    const viewerInterestIds = new Set(viewerInterests.map((i) => i.interestId));

    const interests = user.interests.map((ui) => ({
      ...ui.interest,
      isShared: viewerInterestIds.has(ui.interestId),
    }));

    // Track profile view
    tracker.track(EVENT_TYPES.PROFILE_VIEWED, userId, {
      viewedUserId: id,
      sharedInterestCount: interests.filter((i) => i.isShared).length,
    });

    return reply.send({
      success: true,
      data: {
        ...user,
        age,
        interests,
        sharedInterests: interests.filter((i) => i.isShared),
      },
    });
  });

  // POST /api/users/me/notifications — update notification preferences
  app.patch('/me/notifications', async (request, reply) => {
    const userId = request.userId;
    const { dailyBatch, intros, matches, reEngagement } = request.body as any;

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(dailyBatch !== undefined && { notifyDailyBatch: dailyBatch }),
        ...(intros !== undefined && { notifyIntros: intros }),
        ...(matches !== undefined && { notifyMatches: matches }),
        ...(reEngagement !== undefined && { notifyReEngagement: reEngagement }),
      },
    });

    return reply.send({ success: true, message: 'Notification preferences updated' });
  });

  // DELETE /api/users/me — soft delete account
  app.delete('/me', async (request, reply) => {
    const userId = request.userId;

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'BANNED', pausedAt: new Date() }, // 7-day grace period
    });

    return reply.send({
      success: true,
      message: 'Account scheduled for deletion. You have 7 days to reactivate.',
    });
  });
}

function calculateProfileCompleteness(user: any): number {
  let score = 0;
  if (user.firstName) score += 0.10;
  if (user.photos && user.photos.length > 0) score += 0.25;
  if (user.bio) score += 0.15;
  if (user.currentRole) score += 0.15;
  if (user.interests && user.interests.length >= 5) score += 0.20;
  if (user.photos && user.photos.length >= 2) score += 0.15;
  return score;
}
