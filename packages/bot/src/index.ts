import 'dotenv/config';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import Fastify from 'fastify';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://tanish.uz';
const BOT_WEBHOOK_URL = process.env.BOT_WEBHOOK_URL;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// /start command — opens Mini App
bot.command('start', async (ctx) => {
  const startPayload = ctx.match; // handles ?start=ref_xxx

  // Check for referral
  if (startPayload?.startsWith('ref_')) {
    const referrerId = startPayload.replace('ref_', '');
    // Store referral info (handled by API when user authenticates)
    console.log(`Referral from: ${referrerId}`);
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

// /profile command — opens profile editor
bot.command('profile', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp(
    '✏️ Edit Profile',
    `${WEBAPP_URL}?page=profile`
  );

  await ctx.reply(
    '📝 View and edit your Tanish profile:',
    { reply_markup: keyboard }
  );
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

// Handle pre_checkout_query (for Telegram Stars payments)
bot.on('pre_checkout_query', async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (error) {
    console.error('Pre-checkout error:', error);
    await ctx.answerPreCheckoutQuery(false, { error_message: 'Payment failed. Please try again.' });
  }
});

// Handle successful payments
bot.on('message:successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  console.log('💰 Payment received:', {
    amount: payment.total_amount,
    currency: payment.currency,
    telegramPaymentChargeId: payment.telegram_payment_charge_id,
    userId: ctx.from?.id,
  });

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

// Start bot
async function start() {
  if (BOT_WEBHOOK_URL) {
    // Production: webhook mode
    const app = Fastify({ logger: true });

    app.post('/bot/webhook', webhookCallback(bot, 'fastify'));

    app.get('/bot/health', async () => ({
      status: 'ok',
      bot: 'running',
      timestamp: new Date().toISOString(),
    }));

    await bot.api.setWebhook(BOT_WEBHOOK_URL);
    console.log(`🤖 Bot webhook set to: ${BOT_WEBHOOK_URL}`);

    const PORT = parseInt(process.env.BOT_PORT || '3002', 10);
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🤖 Bot webhook server running on port ${PORT}`);
  } else {
    // Development: long polling
    console.log('🤖 Starting bot in long polling mode...');
    await bot.start({
      onStart: () => console.log('🤖 Tanish Bot is running!'),
    });
  }
}

start().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});

export { bot };
