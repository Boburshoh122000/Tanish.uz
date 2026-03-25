import { Bot } from 'grammy';

/**
 * Registers the bot webhook with Telegram on startup.
 * Uses RAILWAY_PUBLIC_DOMAIN if available, falls back to WEBHOOK_URL.
 *
 * Call this ONCE on bot startup, not on every request.
 */
export async function registerWebhook(bot: Bot): Promise<void> {
  const domain =
    process.env.WEBHOOK_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : null);

  if (!domain) {
    console.warn(
      '⚠️  No WEBHOOK_URL or RAILWAY_PUBLIC_DOMAIN set. Falling back to polling mode (dev only).'
    );
    return;
  }

  const webhookUrl = `${domain}/bot/webhook`;

  try {
    await bot.api.setWebhook(webhookUrl, {
      drop_pending_updates: true,
      allowed_updates: [
        'message',
        'callback_query',
        'pre_checkout_query',
        'inline_query',
      ],
      secret_token: process.env.WEBHOOK_SECRET,
    });
    console.log(`✅ Webhook registered: ${webhookUrl}`);
  } catch (error) {
    console.error('❌ Failed to register webhook:', error);
    throw error;
  }
}
