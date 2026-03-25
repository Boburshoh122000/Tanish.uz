import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tanish-photos';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    }

    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

/**
 * Generate a unique key for a photo upload.
 * Format: photos/{userId}/{timestamp}-{random}.{ext}
 */
function generateKey(userId: string, mimeType: string): string {
  const ext = mimeType === 'image/png' ? 'png'
    : mimeType === 'image/webp' ? 'webp'
    : 'jpg';
  const rand = crypto.randomBytes(8).toString('hex');
  return `photos/${userId}/${Date.now()}-${rand}.${ext}`;
}

/**
 * Upload a photo buffer to R2 and return the public URL.
 */
export async function uploadPhoto(
  userId: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ url: string; key: string }> {
  const s3 = getClient();
  const key = generateKey(userId, mimeType);

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const url = R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${key}`
    : `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

  return { url, key };
}

/**
 * Delete a photo from R2 by its key.
 */
export async function deletePhoto(key: string): Promise<void> {
  const s3 = getClient();

  await s3.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  }));
}

/**
 * Extract the R2 key from a full URL.
 */
export function urlToKey(url: string): string | null {
  if (R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL)) {
    return url.slice(R2_PUBLIC_URL.length + 1);
  }
  // Try to extract from S3-style URL
  const match = url.match(/photos\/[^?]+/);
  return match ? match[0] : null;
}

/**
 * Check if R2 is configured.
 */
export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}
