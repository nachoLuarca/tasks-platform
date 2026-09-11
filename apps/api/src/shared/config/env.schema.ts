import { z } from 'zod';

const booleanFromString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

/**
 * API-only settings. NODE_ENV/LOG_LEVEL/DATABASE_URL/REDIS_URL are validated
 * once by `sharedEnvSchema` (packages/shared) instead of a second time here
 * -- see shared/config/config.ts, which merges both.
 */
export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN cannot be empty'),
  BODY_LIMIT: z.string().min(1).default('1mb'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // --- Auth ---
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // Argon2id cost parameters, kept configurable so tests can lower them.
  // Defaults follow the OWASP minimum recommendation for argon2id.
  ARGON2_MEMORY_COST_KIB: z.coerce.number().int().positive().default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

  // --- Rate limiting ---
  RATE_LIMIT_ENABLED: booleanFromString('true'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),

  // --- Account emails ---
  // Per-account ceiling on verification emails in any rolling hour, the
  // one sent at registration included. Unlike RATE_LIMIT_*, this is a
  // business rule (don't let an account turn the app into a mail cannon
  // aimed at its own address), so RATE_LIMIT_ENABLED doesn't switch it off.
  EMAIL_VERIFICATION_MAX_PER_HOUR: z.coerce.number().int().positive().default(3),
});

export type Env = z.infer<typeof envSchema>;
