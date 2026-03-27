import { z } from 'zod';

declare const process: {
      env: Record<string, string | undefined>;
      exit(code: number): never;
};

declare const console: {
      error(...args: unknown[]): void;
      log(...args: unknown[]): void;
      warn(...args: unknown[]): void;
};

const envSchema = z.object({
      // Telegram
                             TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
      TELEGRAM_BOT_USERNAME: z.string().min(1, 'TELEGRAM_BOT_USERNAME is required'),

      // Database — Railway injects this
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

      // Redis — Railway injects this
      REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

      // Auth
      JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

      // URLs
      WEBAPP_URL: z.string().url('WEBAPP_URL must be a valid URL'),
      WEBHOOK_URL: z.string().url().optional(),
      WEBHOOK_SECRET: z.string().optional(),

      // Cloudflare R2
      R2_ACCOUNT_ID: z.string().default(''),
      R2_ACCESS_KEY_ID: z.string().default(''),
      R2_SECRET_ACCESS_KEY: z.string().default(''),
      R2_BUCKET_NAME: z.string().default('tanish-photos'),
      R2_PUBLIC_URL: z.string().default(''),

      // Admin
      ADMIN_TELEGRAM_IDS: z
        .string()
        .transform((val) => val.split(',').map((id) => id.trim()))
        .default(''),
      ADMIN_GROUP_CHAT_ID: z.string().optional(),

      // App
      NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
      PORT: z.coerce.number().default(3000),

      // Railway auto-injected
      RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

/**
 * Validates and returns typed environment config.
 * Crashes the process immediately if required vars are missing.
 * Call once at startup.
 */
export function getConfig(): EnvConfig {
      if (_config) return _config;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
          console.error('Invalid environment variables:');
          for (const issue of result.error.issues) {
                    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
          }
          process.exit(1);
  }

  _config = result.data;
      return _config;
}
