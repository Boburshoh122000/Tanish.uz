import { PrismaClient } from '@prisma/client';
import { LIMITS } from '@tanish/shared';
import { getRedis } from './redis.js';

const ELO_SORTED_SET_PREFIX = 'elo:';

interface EloAdjustment {
  userId: string;
  event: string;
  delta: number;
  newScore: number;
  timestamp: Date;
}

export class EloService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Adjust a user's ELO score with clamping and Redis sync.
   */
  async adjustScore(
    userId: string,
    event: string,
    points: number
  ): Promise<EloAdjustment> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { eloScore: true, city: true },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Clamp to [ELO_MIN, ELO_MAX]
    const rawNew = user.eloScore + points;
    const newScore = Math.max(
      LIMITS.ELO_MIN,
      Math.min(LIMITS.ELO_MAX, rawNew)
    );
    const actualDelta = newScore - user.eloScore;

    // Update PostgreSQL
    await this.prisma.user.update({
      where: { id: userId },
      data: { eloScore: newScore },
    });

    // Sync to Redis sorted set
    try {
      const redis = getRedis();
      const key = `${ELO_SORTED_SET_PREFIX}${user.city.toLowerCase()}`;
      await redis.zadd(key, newScore, userId);
    } catch (err) {
      // Redis is best-effort for ELO; PostgreSQL is source of truth
      console.error('Redis ELO sync failed:', err);
    }

    // Log the adjustment
    await this.prisma.event.create({
      data: {
        userId,
        type: 'elo_adjustment',
        metadata: {
          event,
          delta: actualDelta,
          oldScore: user.eloScore,
          newScore,
        },
      },
    });

    return {
      userId,
      event,
      delta: actualDelta,
      newScore,
      timestamp: new Date(),
    };
  }

  /**
   * Batch adjust scores (e.g., for cron jobs).
   * Processes in chunks to avoid overwhelming the DB.
   */
  async batchDecay(
    userIds: string[],
    pointsPerUser: number
  ): Promise<number> {
    let processed = 0;
    const chunkSize = 50;

    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (userId) => {
          try {
            await this.adjustScore(userId, 'inactive_decay', pointsPerUser);
            processed++;
          } catch (err) {
            console.error(`ELO decay failed for ${userId}:`, err);
          }
        })
      );
    }

    return processed;
  }

  /**
   * Rebuild Redis sorted set from PostgreSQL for a city.
   * Run nightly as a safety net.
   */
  async rebuildRedisSet(city: string): Promise<number> {
    const redis = getRedis();
    const key = `${ELO_SORTED_SET_PREFIX}${city.toLowerCase()}`;

    const users = await this.prisma.user.findMany({
      where: { city, status: 'ACTIVE' },
      select: { id: true, eloScore: true },
    });

    if (users.length === 0) return 0;

    // Clear and rebuild
    await redis.del(key);

    const pipeline = redis.pipeline();
    for (const user of users) {
      pipeline.zadd(key, user.eloScore, user.id);
    }
    await pipeline.exec();

    return users.length;
  }

  /**
   * Get candidates from a city within an ELO range using Redis.
   * Falls back to PostgreSQL if Redis is unavailable.
   */
  async getCandidatesByEloRange(
    city: string,
    minElo: number,
    maxElo: number,
    limit: number
  ): Promise<string[]> {
    try {
      const redis = getRedis();
      const key = `${ELO_SORTED_SET_PREFIX}${city.toLowerCase()}`;
      const members = await redis.zrangebyscore(key, minElo, maxElo, 'LIMIT', 0, limit);
      if (members.length > 0) return members;
    } catch {
      // fallback
    }

    // PostgreSQL fallback
    const users = await this.prisma.user.findMany({
      where: {
        city,
        status: 'ACTIVE',
        eloScore: { gte: minElo, lte: maxElo },
      },
      select: { id: true },
      take: limit,
      orderBy: { eloScore: 'desc' },
    });

    return users.map((u) => u.id);
  }

  /**
   * Get ELO tier for display purposes.
   */
  static getTier(eloScore: number): 1 | 2 | 3 {
    if (eloScore >= 1500) return 1;
    if (eloScore >= 1000) return 2;
    return 3;
  }
}
