import type { FastifyInstance } from 'fastify';
import { validateInitData, createToken } from '../auth/index.js';
import { prisma, bot, tracker } from '../index.js';
import { telegramAuthSchema, EVENT_TYPES } from '@tanish/shared';
import { uploadPhoto, isR2Configured } from '../lib/r2.js';

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
      // ===== NEW USER =====
      isNewUser = true;

      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramUser.id),
          username: telegramUser.username || null,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name || null,
          gender: 'MALE', // Placeholder — set during onboarding
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

      // Fetch Telegram profile photo as default avatar
      await fetchTelegramAvatar(user.id, telegramUser.id, app);

      // Re-fetch user to include the new photo
      user = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          photos: { orderBy: { position: 'asc' } },
          interests: { include: { interest: true } },
        },
      });

      // Track event
      tracker.track(EVENT_TYPES.APP_OPEN, user!.id, { isNewUser: true });
    } else {
      // ===== RETURNING USER — sync Telegram profile data =====
      const updates: Record<string, string> = {};

      if (telegramUser.username && telegramUser.username !== user.username) {
        updates.username = telegramUser.username;
      }
      if (telegramUser.first_name !== user.firstName) {
        updates.firstName = telegramUser.first_name;
      }
      if (telegramUser.last_name && telegramUser.last_name !== user.lastName) {
        updates.lastName = telegramUser.last_name;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
      }

      // Track event
      tracker.track(EVENT_TYPES.APP_OPEN, user.id, { isNewUser: false });
    }

    const token = createToken(user!.id, user!.telegramId);

    return reply.send({
      success: true,
      data: {
        token,
        user: {
          ...user,
          telegramId: user!.telegramId.toString(),
        },
        isNewUser,
        onboardingComplete: user!.profileComplete,
      },
    });
  });
}

/**
 * Fetch the user's Telegram profile photo and save it as their default.
 * Best-effort — silently skips on any failure.
 */
async function fetchTelegramAvatar(
  userId: string,
  telegramId: number,
  app: FastifyInstance
): Promise<void> {
  try {
    // Get profile photos from Telegram
    const photos = await bot.api.getUserProfilePhotos(telegramId, { limit: 1 });

    if (!photos.total_count || photos.photos.length === 0) {
      return; // User has no Telegram profile photo
    }

    // Get the highest resolution version (last in the array)
    const photoSizes = photos.photos[0]!;
    const bestSize = photoSizes[photoSizes.length - 1]!;

    // Get file path from Telegram
    const file = await bot.api.getFile(bestSize.file_id);
    if (!file.file_path) return;

    // Download the file
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) return;

    const buffer = Buffer.from(await response.arrayBuffer());

    if (isR2Configured()) {
      // Upload to R2
      const { url } = await uploadPhoto(userId, buffer, 'image/jpeg');

      await prisma.photo.create({
        data: {
          userId,
          url,
          position: 0, // Primary photo
          verified: false,
        },
      });
    } else {
      // No R2 configured — store Telegram's file URL directly
      // This URL expires, but works for MVP/dev
      await prisma.photo.create({
        data: {
          userId,
          url: fileUrl,
          position: 0,
          verified: false,
        },
      });
    }

    app.log.info(`📸 Telegram avatar imported for user ${userId}`);
  } catch (err) {
    // Silent fail — don't block auth over a photo
    app.log.warn(`Failed to fetch Telegram avatar for user ${userId}: ${err}`);
  }
}
