import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { authMiddleware } from '../auth/index.js';
import { prisma, tracker } from '../index.js';
import { LIMITS, EVENT_TYPES, reorderPhotosSchema } from '@tanish/shared';
import { uploadPhoto, deletePhoto, urlToKey, isR2Configured } from '../lib/r2.js';
import { getRedis } from '../services/redis.js';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DIMENSION = LIMITS.PHOTO_MAX_DIMENSION || 1200;
const MAX_COMPRESSED_BYTES = (LIMITS.PHOTO_COMPRESSED_MAX_SIZE_MB || 1) * 1024 * 1024;
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds

export async function photoRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // POST /api/upload/photo — upload a photo
  app.post('/upload/photo', async (request, reply) => {
    const userId = request.userId;

    if (!isR2Configured()) {
      return reply.status(503).send({
        success: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Photo storage not configured.' },
      });
    }

    // Check photo count limit
    const existingCount = await prisma.photo.count({ where: { userId } });
    if (existingCount >= LIMITS.MAX_PHOTOS) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MAX_PHOTOS', message: `Maximum ${LIMITS.MAX_PHOTOS} photos allowed` },
      });
    }

    // Rate limit: max 3 uploads per hour via Redis INCR + TTL
    const rateLimitKey = `ratelimit:photo:${userId}`;
    try {
      const redis = getRedis();
      const count = await redis.incr(rateLimitKey);
      if (count === 1) {
        await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
      }
      if (count > LIMITS.MAX_PHOTO_UPLOADS_PER_HOUR) {
        return reply.status(429).send({
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many uploads. Try again in an hour.' },
        });
      }
    } catch {
      // Redis unavailable — fall through without rate limiting
      app.log.warn('Redis unavailable for photo rate limiting');
    }

    // Get uploaded file
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      });
    }

    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TYPE', message: 'Only JPEG, PNG, and WebP images are allowed' },
      });
    }

    try {
      // Read file into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      let buffer = Buffer.concat(chunks);

      // Check raw size (5MB limit enforced by multipart plugin, but double-check)
      if (buffer.length > LIMITS.PHOTO_MAX_SIZE_MB * 1024 * 1024) {
        return reply.status(400).send({
          success: false,
          error: { code: 'FILE_TOO_LARGE', message: `File too large. Maximum ${LIMITS.PHOTO_MAX_SIZE_MB}MB.` },
        });
      }

      // Compress with sharp: resize to max dimension, output as WebP
      buffer = Buffer.from(
        await sharp(buffer)
          .resize(MAX_DIMENSION, MAX_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 80 })
          .toBuffer()
      );

      // Verify compressed size — try harder if still too big
      if (buffer.length > MAX_COMPRESSED_BYTES) {
        buffer = Buffer.from(await sharp(buffer).webp({ quality: 60 }).toBuffer());
      }

      // Upload to R2
      const { url } = await uploadPhoto(userId, buffer, 'image/webp');

      // Save to database
      const position = existingCount;
      const photo = await prisma.photo.create({
        data: { userId, url, position },
        select: { id: true, url: true, position: true },
      });

      // Track event
      tracker.track(EVENT_TYPES.PHOTO_UPLOADED, userId, { photoId: photo.id, position });

      return reply.send({
        success: true,
        data: { id: photo.id, url: photo.url, position: photo.position },
      });
    } catch (err) {
      app.log.error(err, 'Photo upload failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'UPLOAD_FAILED', message: 'Failed to process photo. Try again.' },
      });
    }
  });

  // DELETE /api/photos/:id — delete own photo only
  app.delete('/photos/:id', async (request, reply) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };

    const photo = await prisma.photo.findUnique({ where: { id }, select: { id: true, userId: true, url: true } });
    if (!photo || photo.userId !== userId) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Photo not found' },
      });
    }

    // Check minimum photos (can't delete last photo if profile is complete)
    const photoCount = await prisma.photo.count({ where: { userId } });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileComplete: true },
    });
    if (photoCount <= 1 && user?.profileComplete) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MIN_PHOTOS', message: 'Cannot delete your only photo. Upload another first.' },
      });
    }

    // Delete from R2
    try {
      const key = urlToKey(photo.url);
      if (key) await deletePhoto(key);
    } catch (err) {
      app.log.warn({ err }, 'R2 delete failed (continuing)');
    }

    // Delete from database
    await prisma.photo.delete({ where: { id } });

    // Reorder remaining photos
    const remaining = await prisma.photo.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i]!.position !== i) {
        await prisma.photo.update({
          where: { id: remaining[i]!.id },
          data: { position: i },
        });
      }
    }

    return reply.send({ success: true, data: { deleted: true } });
  });

  // PATCH /api/photos/reorder — reorder photos
  app.patch('/photos/reorder', async (request, reply) => {
    const userId = request.userId;
    const body = reorderPhotosSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid request' },
        details: body.error.flatten(),
      });
    }

    const { photoIds } = body.data;

    // Verify all photos belong to user
    const photos = await prisma.photo.findMany({
      where: { id: { in: photoIds }, userId },
      select: { id: true },
    });

    if (photos.length !== photoIds.length) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PHOTOS', message: 'Some photo IDs are invalid or not yours' },
      });
    }

    // Update positions
    await Promise.all(
      photoIds.map((id, index) =>
        prisma.photo.update({
          where: { id },
          data: { position: index },
        })
      )
    );

    return reply.send({ success: true, data: { reordered: true } });
  });
}
