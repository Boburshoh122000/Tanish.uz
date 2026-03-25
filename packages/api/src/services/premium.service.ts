import { PrismaClient } from '@prisma/client';
import { Bot } from 'grammy';
import { PREMIUM_PRICE_STARS, PREMIUM_PROMO_PRICE_STARS, PREMIUM_DURATION_DAYS } from '@tanish/shared';

export class PremiumService {
  constructor(
    private prisma: PrismaClient,
    private bot: Bot
  ) {}

  /**
   * Create a Telegram Stars invoice link for premium subscription.
   */
  async createInvoice(userId: string, promo: boolean = false): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true, isPremium: true },
    });

    if (!user) throw new Error('User not found');

    if (user.isPremium) {
      throw new Error('Already a premium member');
    }

    const price = promo ? PREMIUM_PROMO_PRICE_STARS : PREMIUM_PRICE_STARS;

    const invoiceLink = await this.bot.api.createInvoiceLink(
      'Tanish Premium',
      'Get 8 daily matches, see who likes you, profile boost, and priority matching.',
      JSON.stringify({ userId, plan: 'monthly', promo }),
      '', // provider_token: empty for Telegram Stars
      'XTR', // Telegram Stars currency
      [{ label: 'Premium Monthly', amount: price }]
    );

    // Track premium page view
    await this.prisma.event.create({
      data: { userId, type: 'premium_viewed' },
    });

    return invoiceLink;
  }

  /**
   * Activate premium after successful payment.
   */
  async activatePremium(
    telegramId: number,
    transactionId: string,
    amount: number
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true, isPremium: true },
    });

    if (!user) {
      console.error(`Premium activation failed: user with telegramId ${telegramId} not found`);
      return;
    }

    const premiumUntil = new Date(Date.now() + PREMIUM_DURATION_DAYS * 24 * 60 * 60 * 1000);

    // Activate premium
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isPremium: true,
        premiumUntil,
      },
    });

    // Log payment
    await this.prisma.payment.create({
      data: {
        userId: user.id,
        amount,
        transactionId,
        plan: 'monthly',
      },
    });

    // Track events
    await this.prisma.event.create({
      data: {
        userId: user.id,
        type: 'premium_purchased',
        metadata: { amount, transactionId },
      },
    });

    console.log(`⭐ Premium activated for user ${user.id} until ${premiumUntil.toISOString()}`);
  }

  /**
   * Handle refund — immediately deactivate premium.
   */
  async handleRefund(telegramId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true },
    });

    if (!user) return;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isPremium: false, premiumUntil: null },
    });

    console.log(`💸 Premium refunded for user ${user.id}`);
  }

  /**
   * Get premium status for a user.
   */
  async getStatus(userId: string): Promise<{
    isPremium: boolean;
    premiumUntil: Date | null;
    daysRemaining: number | null;
    price: number;
    promoPrice: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isPremium: true, premiumUntil: true },
    });

    if (!user) throw new Error('User not found');

    let daysRemaining: number | null = null;
    if (user.isPremium && user.premiumUntil) {
      daysRemaining = Math.max(0, Math.ceil(
        (user.premiumUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      ));
    }

    return {
      isPremium: user.isPremium,
      premiumUntil: user.premiumUntil,
      daysRemaining,
      price: PREMIUM_PRICE_STARS,
      promoPrice: PREMIUM_PROMO_PRICE_STARS,
    };
  }
}
