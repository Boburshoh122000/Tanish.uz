import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../index.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const JWT_SECRET = process.env.JWT_SECRET!;

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/**
 * Validate Telegram initData using HMAC-SHA256
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');
    const entries = Array.from(params.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = entries.map(([key, val]) => `${key}=${val}`).join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) return null;

    // Reject initData older than 30 minutes.
    // auth_date is set when the Mini App opens; users may take a few minutes
    // to load, so 5 min is too tight. 30 min balances security vs. UX.
    const authDate = params.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10) * 1000;
      if (Date.now() - authTimestamp > 30 * 60 * 1000) return null;
    }

    const userStr = params.get('user');
    if (!userStr) return null;

    return JSON.parse(userStr) as TelegramUser;
  } catch {
    return null;
  }
}

export function createToken(userId: string, telegramId: bigint): string {
  return jwt.sign(
    { userId, telegramId: telegramId.toString() },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): { userId: string; telegramId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; telegramId: string };
  } catch {
    return null;
  }
}

/**
 * Auth middleware — validates JWT on every request
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ success: false, error: 'Missing authorization token' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return reply.status(401).send({ success: false, error: 'Invalid or expired token' });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, telegramId: true, status: true, lastActiveAt: true },
  });

  if (!user) {
    return reply.status(401).send({ success: false, error: 'User not found' });
  }

  if (user.status === 'BANNED') {
    return reply.status(403).send({ success: false, error: 'Account has been banned' });
  }

  // Throttle lastActiveAt writes to once per 5 minutes to reduce DB load.
  // With 1000 DAU × 20 req/day, this cuts UPDATE queries from 20k to ~2k/day.
  const ACTIVE_THROTTLE_MS = 5 * 60 * 1000;
  if (Date.now() - user.lastActiveAt.getTime() > ACTIVE_THROTTLE_MS) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });
  }

  request.userId = user.id;
  request.telegramId = user.telegramId;
}
