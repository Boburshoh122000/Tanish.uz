import type { PrismaClient } from '@prisma/client';
import { PREMIUM_DURATION_DAYS } from '@tanish/shared';

/**
 * Single source of truth for payment activation.
 * Called from bot's successful_payment handler.
 * Uses upsert on transactionId to prevent duplicate processing.
 */
export const PremiumService = {
  async activate(
    prisma: PrismaClient,
    telegramId: number,
    transactionId: string,
    amount: number,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true },
    });

    if (!user) {
      console.error(`Payment received but user not found: telegramId=${telegramId}`);
      return;
    }

    // Check for duplicate transaction (idempotency guard)
    const existing = await prisma.payment.findUnique({
      where: { transactionId },
    });
    if (existing) {
      console.warn(`Duplicate payment ignored: transactionId=${transactionId}`);
      return;
    }

    const premiumUntil = new Date(Date.now() + PREMIUM_DURATION_DAYS * 24 * 60 * 60 * 1000);

    // Atomic: activate premium + log payment
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { isPremium: true, premiumUntil },
      }),
      prisma.payment.create({
        data: { userId: user.id, amount, transactionId, plan: 'monthly' },
      }),
      prisma.event.create({
        data: {
          userId: user.id,
          type: 'premium_purchased',
          metadata: { amount, transactionId },
        },
      }),
    ]);
  },
};
