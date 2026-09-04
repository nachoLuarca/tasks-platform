import { envSchema } from './env.schema.js';

/**
 * This is the only module allowed to read `process.env` directly. Everything
 * else must import `config` from here so the app has a single, validated
 * source of truth for its settings.
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
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    cors: Object.freeze({
      origin: env.CORS_ORIGIN,
    }),
    bodyLimit: env.BODY_LIMIT,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    database: Object.freeze({
      url: env.DATABASE_URL,
    }),
    redis: Object.freeze({
      url: env.REDIS_URL,
    }),
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
