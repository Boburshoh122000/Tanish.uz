import 'dotenv/config';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import type { Worker } from 'bullmq';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { registerWebhook } from './register-webhook.js';
import { PREMIUM_DURATION_DAYS } from '@tanish/shared';
import { startNotificationWorker } from './queue/notification.queue.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://tanish.uz';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);
const prisma = new PrismaClient();

// /start command — opens Mini App, handles referrals
bot.command('start', async (ctx) => {
  const startPayload = ctx.match;
  const telegramId = ctx.from?.id;

  // Handle referral: store the referral code on the user record
  if (startPayload?.startsWith('ref_') && telegramId) {
    const referralCode = startPayload.replace('ref_', '');
    try {
      // Find referrer by code
      const referrer = await prisma.user.findUnique({
        where: { referralCode },
        select: { id: true },
      });

      if (referrer) {
        // Link this user to referrer (if user exists and isn't already referred)
        await prisma.user.updateMany({
          where: {
            telegramId: BigInt(telegramId),
            referredById: null, // Don't overwrite existing referral
          },
          data: { referredById: referrer.id },
        });
        console.log(`🎁 Referral linked: code=${referralCode}, newUser=${telegramId}`);
      }
    } catch (err) {
      console.error('Referral linking failed:', err);
    }
  }

  await ctx.reply(
    '👋 Welcome to Tanish!\n\n' +
    'Discover amazing people around you — professionals, creatives, and like-minded individuals in Tashkent.\n\n' +
    'Tap the button below to get started! 👇',
    {
      reply_markup: {
        keyboard: [
          [{ text: '🔍 Open Tanish', web_app: { url: WEBAPP_URL } }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    }
  );
});

// /profile command
bot.command('profile', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp(
    '✏️ Edit Profile',
    `${WEBAPP_URL}?page=profile`
  );
  await ctx.reply('📝 View and edit your Tanish profile:', { reply_markup: keyboard });
});

// /help command
bot.command('help', async (ctx) => {
  await ctx.reply(
    '🆘 *Tanish Help*\n\n' +
    '• /start — Open the Tanish app\n' +
    '• /profile — Edit your profile\n' +
    '• /help — Show this help message\n\n' +
    '*How it works:*\n' +
    '1️⃣ Complete your profile\n' +
    '2️⃣ Every day you get curated matches\n' +
    '3️⃣ Say hi with an icebreaker question\n' +
    '4️⃣ Both answer → chat is unlocked!\n\n' +
    '🔒 *Safety*: Report or block anyone who makes you uncomfortable.\n\n' +
    'Questions? Contact @TanishSupport',
    { parse_mode: 'Markdown' }
  );
});

// /referral command — show referral link
bot.command('referral', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { referralCode: true },
    });

    if (!user) {
      await ctx.reply('Open Tanish and complete your profile first!');
      return;
    }

    let code = user.referralCode;
    if (!code) {
      const crypto = await import('node:crypto');
      code = crypto.randomBytes(4).toString('hex');
      await prisma.user.update({
        where: { telegramId: BigInt(telegramId) },
        data: { referralCode: code },
      });
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'TanishBot';
    const link = `https://t.me/${botUsername}?start=ref_${code}`;

    await ctx.reply(
      `🎁 *Your referral link:*\n\n\`${link}\`\n\n` +
      'Share with friends! When they complete their profile, you both get a bonus match.',
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Referral command failed:', err);
    await ctx.reply('Something went wrong. Try again later.');
  }
});

// ===== Telegram Stars Payments =====

bot.on('pre_checkout_query', async (ctx) => {
  try {
    // Validate the payload
    const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload);
    if (!payload.userId || !payload.plan) {
      await ctx.answerPreCheckoutQuery(false, { error_message: 'Invalid payment data.' });
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  } catch (error) {
    console.error('Pre-checkout error:', error);
    await ctx.answerPreCheckoutQuery(false, { error_message: 'Payment failed. Please try again.' });
  }
});

bot.on('message:successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  const telegramId = ctx.from?.id;

  if (!telegramId) return;

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true },
    });

    if (!user) {
      console.error(`Payment received but user not found: telegramId=${telegramId}`);
      return;
    }

    const premiumUntil = new Date(Date.now() + PREMIUM_DURATION_DAYS * 24 * 60 * 60 * 1000);

    // Activate premium
    await prisma.user.update({
      where: { id: user.id },
      data: { isPremium: true, premiumUntil },
    });

    // Log payment
    await prisma.payment.create({
      data: {
        userId: user.id,
        amount: payment.total_amount,
        transactionId: payment.telegram_payment_charge_id,
        plan: 'monthly',
      },
    });

    // Track premium purchase event
    await prisma.event.create({
      data: {
        userId: user.id,
        type: 'premium_purchased',
        metadata: { amount: payment.total_amount, transactionId: payment.telegram_payment_charge_id },
      },
    });

    console.log(`⭐ Premium activated: user=${user.id}, amount=${payment.total_amount} Stars`);
  } catch (err) {
    console.error('Payment processing failed:', err);
  }

  await ctx.reply(
    '✨ Welcome to Tanish Premium!\n\n' +
    '🎯 8 daily matches\n' +
    '👀 See who likes you\n' +
    '⚡ Profile boost once per week\n' +
    '🏆 Priority matching\n\n' +
    'Enjoy your upgraded experience!',
  );
});

// Error handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`, err.error);
});

// ===== Start =====

let notificationWorker: Worker | null = null;

async function start() {
  // Register bot commands so users see suggestions when typing /
  await bot.api.setMyCommands([
    { command: 'start', description: 'Open Tanish' },
    { command: 'profile', description: 'Edit your profile' },
    { command: 'referral', description: 'Get your referral link' },
    { command: 'help', description: 'How to use Tanish' },
  ]);

  // Start notification worker (requires REDIS_URL)
  if (process.env.REDIS_URL) {
    notificationWorker = startNotificationWorker(bot);
  } else {
    console.warn('⚠️ REDIS_URL not set — notification worker disabled');
  }

  const webhookUrl = process.env.WEBHOOK_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : null);

  if (webhookUrl) {
    const app = Fastify({ logger: true });
    app.post('/bot/webhook', webhookCallback(bot, 'fastify'));
    app.get('/bot/health', async () => ({
      status: 'ok',
      bot: 'running',
      worker: notificationWorker ? 'running' : 'disabled',
      timestamp: new Date().toISOString(),
    }));

    await registerWebhook(bot);

    const PORT = parseInt(process.env.PORT || process.env.BOT_PORT || '3002', 10);
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🤖 Bot webhook server running on port ${PORT}`);
  } else {
    // Clear any stale webhook — Telegram ignores polling if a webhook is registered.
    // This is the #1 cause of "bot stops responding after Railway restart".
    console.log('🤖 Clearing any stale webhook before polling...');
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log('✅ Webhook cleared, starting long polling...');

    await bot.start({
      onStart: () => console.log('🤖 Tanish Bot is running!'),
    });
  }
}

// Graceful shutdown — close worker before bot
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    // 1. Stop accepting new notification jobs
    if (notificationWorker) {
      console.log('Closing notification worker...');
      await notificationWorker.close();
    }
    // 2. Stop bot
    await bot.stop();
    // 3. Disconnect database
    await prisma.$disconnect();
    process.exit(0);
  });
}

start().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});

export { bot };
