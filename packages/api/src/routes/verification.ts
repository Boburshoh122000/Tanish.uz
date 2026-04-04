import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { authMiddleware } from '../auth/index.js';
import { prisma, tracker } from '../index.js';
import { LIMITS, EVENT_TYPES } from '@tanish/shared';
import { uploadPhoto, isR2Configured } from '../lib/r2.js';
import { getRedis } from '../services/redis.js';

const MAX_DIMENSION = LIMITS.PHOTO_MAX_DIMENSION || 1200;
const RATE_LIMIT_KEY_PREFIX = 'verify:cooldown:';
const RATE_LIMIT_SECONDS = 24 * 60 * 60; // 24 hours

export async function verificationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // ─── POST /api/verify/submit ────────────────────────────────────
  app.post('/submit', async (request, reply) => {
    const userId = request.userId;

    if (!isR2Configured()) {
      return reply.status(503).send({
        success: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Photo storage not configured.' },
      });
    }

    // Check if already verified
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        verified: true,
        photos: { where: { position: 0 }, select: { url: true }, take: 1 },
      },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    if (user.verified) {
      return reply.status(400).send({
        success: false,
        error: { code: 'ALREADY_VERIFIED', message: 'You are already verified.' },
      });
    }

    // Check for existing pending verification
    const existingPending = await prisma.verification.findFirst({
      where: { userId, status: 'PENDING' },
      select: { id: true },
    });
    if (existingPending) {
      return reply.status(409).send({
        success: false,
        error: { code: 'ALREADY_PENDING', message: 'You already have a pending verification.' },
      });
    }

    // Rate limit: 1 submission per 24h (Redis)
    try {
      const redis = getRedis();
      const key = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
      const exists = await redis.exists(key);
      if (exists) {
        const ttl = await redis.ttl(key);
        const hoursLeft = Math.ceil(ttl / 3600);
        return reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Please wait ${hoursLeft}h before submitting again.`,
          },
        });
      }
    } catch {
      // Redis unavailable — skip rate limit
    }

    // Must have at least one profile photo
    if (user.photos.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_PHOTO', message: 'Upload a profile photo before verifying.' },
      });
    }

    const profilePhotoUrl = user.photos[0].url;

    // Get uploaded selfie
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No selfie uploaded.' },
      });
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TYPE', message: 'Only JPEG, PNG, and WebP images are allowed.' },
      });
    }

    try {
      // Read file into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      let buffer = Buffer.concat(chunks);

      if (buffer.length > LIMITS.PHOTO_MAX_SIZE_MB * 1024 * 1024) {
        return reply.status(400).send({
          success: false,
          error: { code: 'FILE_TOO_LARGE', message: `File too large. Maximum ${LIMITS.PHOTO_MAX_SIZE_MB}MB.` },
        });
      }

      // Validate actual image content via magic bytes
      const metadata = await sharp(buffer).metadata();
      if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_IMAGE', message: 'File is not a valid JPEG, PNG, or WebP image' },
        });
      }

      // Compress: resize + webp 80%
      buffer = Buffer.from(
        await sharp(buffer)
          .resize(MAX_DIMENSION, MAX_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 80 })
          .toBuffer(),
      );

      // Upload to R2 (reuses shared singleton client)
      const { url: selfieUrl } = await uploadPhoto(`verify-${userId}`, buffer, 'image/webp');

      // Create verification record
      const verification = await prisma.verification.create({
        data: {
          userId,
          selfieUrl,
          profilePhotoUrl,
        },
        select: { id: true, status: true },
      });

      // Track event
      tracker.track(EVENT_TYPES.VERIFICATION_REQUESTED, userId, {});

      // Set rate limit in Redis
      try {
        const redis = getRedis();
        await redis.set(`${RATE_LIMIT_KEY_PREFIX}${userId}`, '1', 'EX', RATE_LIMIT_SECONDS);
      } catch {
        // Redis unavailable — skip
      }

      return reply.send({
        success: true,
        data: { verificationId: verification.id, status: verification.status },
      });
    } catch (err) {
      app.log.error(err, 'Verification selfie upload failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'UPLOAD_FAILED', message: 'Failed to process selfie. Try again.' },
      });
    }
  });

  // ─── GET /api/verify/status ─────────────────────────────────────
  app.get('/status', async (request, reply) => {
    const userId = request.userId;

    const latest = await prisma.verification.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
      },
    });

    if (!latest) {
      return reply.send({
        success: true,
        data: { status: 'NOT_STARTED' },
      });
    }

    return reply.send({
      success: true,
      data: {
        id: latest.id,
        status: latest.status,
        rejectionReason: latest.rejectionReason,
        createdAt: latest.createdAt,
      },
    });
  });
}

