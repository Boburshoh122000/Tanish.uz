import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';
import { getConfig } from '@tanish/shared';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    const config = getConfig();
    if (!config.R2_ACCOUNT_ID || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    }

    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

/**
 * Upload a photo buffer to R2 and return the public URL.
 * Key format: photos/{userId}/{uuid}.webp
 */
export async function uploadPhoto(
  userId: string,
  buffer: Buffer,
  contentType: string
): Promise<{ url: string; key: string }> {
  const config = getConfig();
  const s3 = getClient();
  const ext = contentType === 'image/png' ? 'png'
    : contentType === 'image/webp' ? 'webp'
    : 'jpg';
  const key = `photos/${userId}/${crypto.randomUUID()}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: config.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const url = config.R2_PUBLIC_URL
    ? `${config.R2_PUBLIC_URL}/${key}`
    : `https://${config.R2_BUCKET_NAME}.${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

  return { url, key };
}

/**
 * Delete a photo from R2 by its key.
 */
export async function deletePhoto(key: string): Promise<void> {
  const config = getConfig();
  const s3 = getClient();

  await s3.send(new DeleteObjectCommand({
    Bucket: config.R2_BUCKET_NAME,
    Key: key,
  }));
}

/**
 * Extract the R2 key from a full URL.
 */
export function urlToKey(url: string): string | null {
  const config = getConfig();
  if (config.R2_PUBLIC_URL && url.startsWith(config.R2_PUBLIC_URL)) {
    return url.slice(config.R2_PUBLIC_URL.length + 1);
  }
  const match = url.match(/photos\/[^?]+/);
  return match ? match[0] : null;
}

/**
 * Check if R2 is configured.
 */
export function isR2Configured(): boolean {
  const config = getConfig();
  return !!(config.R2_ACCOUNT_ID && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY);
}
