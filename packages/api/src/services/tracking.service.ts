import type { PrismaClient } from '@prisma/client';
import {
  type EventType,
  type EventMetadataMap,
  VALID_EVENT_TYPES,
  eventMetadataSchemas,
} from '@tanish/shared';

interface TrackingServiceConfig {
  /** Validate metadata schemas at runtime (dev/staging only for performance). */
  validateMetadata: boolean;
  /** Log warnings for unknown event types instead of throwing. */
  softFail: boolean;
}

const DEFAULT_CONFIG: TrackingServiceConfig = {
  validateMetadata: process.env.NODE_ENV !== 'production',
  softFail: true,
};

/**
 * Centralized event tracking service.
 *
 * ALL event writes go through this service — no direct prisma.event.create()
 * calls anywhere else in the codebase.
 *
 * Writes are NON-BLOCKING by default: fire-and-forget Prisma insert.
 * Errors are caught and logged, never propagated to the caller.
 */
export class TrackingService {
  private config: TrackingServiceConfig;

  constructor(
    private prisma: PrismaClient,
    config?: Partial<TrackingServiceConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Track a product event. Non-blocking — returns immediately.
   *
   * @example
   * tracker.track('batch_viewed', userId, { batchSize: 3, isPremium: false });
   */
  track<T extends EventType>(
    type: T,
    userId: string,
    metadata?: EventMetadataMap[T],
  ): void {
    if (!VALID_EVENT_TYPES.has(type)) {
      const msg = `[tracking] Unknown event type: "${type}"`;
      if (this.config.softFail) {
        console.warn(msg);
        return;
      }
      throw new Error(msg);
    }

    if (this.config.validateMetadata && metadata !== undefined) {
      const schema = eventMetadataSchemas[type];
      if (schema) {
        const result = schema.safeParse(metadata);
        if (!result.success) {
          console.warn(
            `[tracking] Invalid metadata for "${type}":`,
            result.error.flatten().fieldErrors,
          );
        }
      }
    }

    // Non-blocking write
    this.prisma.event
      .create({
        data: {
          userId,
          type,
          metadata: (metadata as Record<string, unknown>) ?? undefined,
        },
      })
      .catch((err) => {
        console.error(`[tracking] Failed to write "${type}" for ${userId}:`, err);
      });
  }

  /**
   * Track and WAIT for the write. Use only when the event must exist
   * before the next step (e.g., dedup checks).
   */
  async trackSync<T extends EventType>(
    type: T,
    userId: string,
    metadata?: EventMetadataMap[T],
  ): Promise<void> {
    if (!VALID_EVENT_TYPES.has(type)) {
      console.warn(`[tracking] Unknown event type: "${type}"`);
      return;
    }

    try {
      await this.prisma.event.create({
        data: {
          userId,
          type,
          metadata: (metadata as Record<string, unknown>) ?? undefined,
        },
      });
    } catch (err) {
      console.error(`[tracking] Failed to write "${type}" for ${userId}:`, err);
    }
  }

  /**
   * Batch track multiple events (e.g., match_created for both users).
   * Non-blocking.
   */
  trackMany(
    events: Array<{ type: EventType; userId: string; metadata?: Record<string, unknown> }>,
  ): void {
    this.prisma.event
      .createMany({
        data: events.map((e) => ({
          userId: e.userId,
          type: e.type,
          metadata: e.metadata ?? undefined,
        })),
      })
      .catch((err) => {
        console.error(`[tracking] Batch write failed (${events.length} events):`, err);
      });
  }
}
