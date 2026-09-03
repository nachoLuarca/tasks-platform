import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN cannot be empty'),
  BODY_LIMIT: z.string().min(1).default('1mb'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid connection URL'),
});

export type Env = z.infer<typeof envSchema>;
