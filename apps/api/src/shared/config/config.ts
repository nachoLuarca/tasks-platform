import { sharedConfig } from '@tasks-platform/shared';

import { envSchema } from './env.schema.js';

/**
 * This is the only module allowed to read `process.env` directly for
 * API-only settings. `sharedConfig` (packages/shared) already validated the
 * settings every process needs (db, redis, nodeEnv, logLevel, ...) -- this
 * just adds the api's own on top, so the rest of the codebase keeps
 * importing a single `config` object with everything it needs, unaware that
 * part of it now comes from a shared package.
 */
function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  const env = result.data;

  return Object.freeze({
    nodeEnv: sharedConfig.nodeEnv,
    isProduction: sharedConfig.isProduction,
    isDevelopment: sharedConfig.isDevelopment,
    isTest: sharedConfig.isTest,
    port: env.PORT,
    logLevel: sharedConfig.logLevel,
    appPublicUrl: sharedConfig.appPublicUrl,
    cors: Object.freeze({
      origin: env.CORS_ORIGIN,
    }),
    bodyLimit: env.BODY_LIMIT,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    database: sharedConfig.database,
    redis: sharedConfig.redis,
    auth: Object.freeze({
      jwtSecret: env.JWT_SECRET,
      cookieSameSite: env.COOKIE_SAME_SITE,
    }),
    argon2: Object.freeze({
      memoryCostKib: env.ARGON2_MEMORY_COST_KIB,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    }),
    rateLimit: Object.freeze({
      enabled: env.RATE_LIMIT_ENABLED,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxAttempts: env.RATE_LIMIT_MAX_ATTEMPTS,
    }),
  });
}

export const config = loadConfig();
export type Config = typeof config;
