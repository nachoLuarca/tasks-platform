import { z } from 'zod';

const booleanFromString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN cannot be empty'),
  BODY_LIMIT: z.string().min(1).default('1mb'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid connection URL'),

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
});

export type Env = z.infer<typeof envSchema>;
