import { sharedEnvSchema } from './env.schema.js';

/**
 * Loads and validates the settings every process needs (db, redis, smtp,
 * ...). Each app calls this once from its own config module and merges the
 * result with its process-specific settings -- see
 * apps/api/src/shared/config/config.ts and apps/worker/src/config/config.ts.
 * Like apps/api's original config module, this is the only place allowed to
 * read `process.env` for these keys.
 */
export function loadSharedConfig() {
  const result = sharedEnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  const env = result.data;

  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
    logLevel: env.LOG_LEVEL,
    appPublicUrl: env.APP_PUBLIC_URL,
    database: Object.freeze({ url: env.DATABASE_URL }),
    redis: Object.freeze({ url: env.REDIS_URL }),
    smtp: Object.freeze({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.SMTP_FROM,
    }),
    webhook: Object.freeze({
      deliveryTimeoutMs: env.WEBHOOK_DELIVERY_TIMEOUT_MS,
      maxConsecutiveFailures: env.WEBHOOK_MAX_CONSECUTIVE_FAILURES,
      signatureToleranceSeconds: env.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
    }),
  });
}

export const sharedConfig = loadSharedConfig();
export type SharedConfig = typeof sharedConfig;
