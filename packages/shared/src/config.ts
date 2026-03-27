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
      TELEGRAM_BOT_USERNAME: z.string().default('TanishBot'),

      // Database — Railway injects this
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

      // Redis — optional, app degrades gracefully without it
      REDIS_URL: z.string().default(''),

      // Auth
      JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

      // URLs
      WEBAPP_URL: z.string().default('https://tanish.uz'),
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
 * Only crashes on truly critical vars (BOT_TOKEN, DATABASE_URL, JWT_SECRET).
 * Everything else has safe defaults.
 */
export function getConfig(): EnvConfig {
      if (_config) return _config;

  const result = envSchema.safeParse(process.env);

  if (result.success) {
          _config = result.data;
          return _config;
  }

  // Log all issues
  console.error('Environment variable validation errors:');
  for (const issue of result.error.issues) {
          console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }

  // Check if any critical vars failed
  const criticalPaths = new Set(['TELEGRAM_BOT_TOKEN', 'DATABASE_URL', 'JWT_SECRET']);
  const hasCriticalFailure = result.error.issues.some(
          (i) => criticalPaths.has(String(i.path[0])),
  );

  if (hasCriticalFailure) {
          process.exit(1);
  }

  // Non-critical failure: build config manually from env with defaults
  _config = {
          TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
          TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || 'TanishBot',
          DATABASE_URL: process.env.DATABASE_URL!,
          REDIS_URL: process.env.REDIS_URL || '',
          JWT_SECRET: process.env.JWT_SECRET!,
          WEBAPP_URL: process.env.WEBAPP_URL || 'https://tanish.uz',
          WEBHOOK_URL: process.env.WEBHOOK_URL,
          WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
          R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
          R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
          R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
          R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'tanish-photos',
          R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || '',
          ADMIN_TELEGRAM_IDS: (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map((s) => s.trim()),
          ADMIN_GROUP_CHAT_ID: process.env.ADMIN_GROUP_CHAT_ID,
          NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
          PORT: parseInt(process.env.PORT || '3000', 10),
          RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
  } as EnvConfig;

  return _config;
}
