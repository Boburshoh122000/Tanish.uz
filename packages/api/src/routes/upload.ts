import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { authMiddleware } from '../auth/index.js';
import { prisma } from '../index.js';
import { LIMITS, reorderPhotosSchema } from '@tanish/shared';
import { uploadPhoto, deletePhoto, urlToKey, isR2Configured } from '../services/r2.service.js';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DIMENSION = LIMITS.PHOTO_MAX_DIMENSION || 1200;
const MAX_COMPRESSED_BYTES = (LIMITS.PHOTO_COMPRESSED_MAX_SIZE_MB || 1) * 1024 * 1024;

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // POST /api/upload/photo — upload a photo
  app.post('/photo', async (request, reply) => {
    const userId = (request as any).userId;

    // Check R2 config
    if (!isR2Configured()) {
      return reply.status(503).send({
        success: false,
        error: 'Photo storage not configured. Contact admin.',
      });
    }

    // Check photo count limit
    const existingCount = await prisma.photo.count({ where: { userId } });
    if (existingCount >= LIMITS.MAX_PHOTOS) {
      return reply.status(400).send({
        success: false,
        error: `Maximum ${LIMITS.MAX_PHOTOS} photos allowed`,
      });
    }

    // Rate limit: max 3 uploads per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentUploads = await prisma.event.count({
      where: {
        userId,
        type: 'photo_uploaded',
        createdAt: { gte: oneHourAgo },
      },
    });
    if (recentUploads >= LIMITS.MAX_PHOTO_UPLOADS_PER_HOUR) {
      return reply.status(429).send({
        success: false,
        error: 'Too many uploads. Try again in an hour.',
      });
    }

    // Get uploaded file
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ success: false, error: 'No file uploaded' });
    }

    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return reply.status(400).send({
        success: false,
        error: 'Only JPEG, PNG, and WebP images are allowed',
      });
    }

    try {
      // Read file into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      let buffer: Buffer<ArrayBufferLike> = Buffer.concat(chunks) as Buffer<ArrayBufferLike>;

      // Check raw size (5MB limit enforced by multipart plugin, but double check)
      if (buffer.length > 5 * 1024 * 1024) {
        return reply.status(400).send({
          success: false,
          error: 'File too large. Maximum 5MB.',
        });
      }

      // Compress with sharp: resize to max dimension, quality 80, output as JPEG
      buffer = await sharp(buffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();

      // Verify compressed size
      if (buffer.length > MAX_COMPRESSED_BYTES) {
        // Try harder compression
        buffer = await sharp(buffer).jpeg({ quality: 60, progressive: true }).toBuffer();
      }

      // Upload to R2
      const { url } = await uploadPhoto(userId, buffer, 'image/jpeg');

      // Save to database
      const position = existingCount; // Append at end
      const photo = await prisma.photo.create({
        data: { userId, url, position },
      });

      // Track event
      await prisma.event.create({
        data: { userId, type: 'photo_uploaded', metadata: { photoId: photo.id } },
      });

      return reply.send({
        success: true,
        data: {
          id: photo.id,
          url: photo.url,
          position: photo.position,
        },
      });
    } catch (err: any) {
      app.log.error('Photo upload failed:', err);
      return reply.status(500).send({
        success: false,
        error: 'Failed to process photo. Try again.',
      });
    }
  });

  // DELETE /api/upload/photo/:id — delete a photo
  app.delete('/photo/:id', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params as { id: string };

    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo || photo.userId !== userId) {
      return reply.status(404).send({ success: false, error: 'Photo not found' });
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
        error: 'Cannot delete your only photo. Upload another first.',
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

  // PATCH /api/upload/photos/reorder — reorder photos
  app.patch('/photos/reorder', async (request, reply) => {
    const userId = (request as any).userId;
    const body = reorderPhotosSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request',
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
        error: 'Some photo IDs are invalid or not yours',
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
