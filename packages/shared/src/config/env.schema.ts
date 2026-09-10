import { z } from 'zod';

const booleanFromString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

/**
 * Settings shared by every process in the monorepo (api and worker): the
 * database, Redis, SMTP and the public URL used to build links in emails.
 * Process-specific settings (HTTP port, CORS, JWT secret, ...) stay in each
 * app's own env schema, which extends this one -- see
 * apps/api/src/shared/config/env.schema.ts.
 */
export const sharedEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid connection URL'),

  // Base URL the API is reachable at, used to build links inside emails
  // (e.g. the invitation link) since a background job has no `req` to read
  // `req.protocol`/`req.get('host')` from, unlike an HTTP handler.
  APP_PUBLIC_URL: z.string().url('APP_PUBLIC_URL must be a valid URL'),

  // Base URL of the web client. Email-verification and password-reset links
  // point here, not at the API: consuming a single-use token must be a
  // deliberate POST from a page, never a GET that a mail scanner prefetching
  // links would trigger. The token travels in the URL fragment (#token=...),
  // which browsers never send to any server, nor in a Referer header.
  WEB_APP_URL: z.string().url('WEB_APP_URL must be a valid URL').default('http://localhost:5173'),

  // --- SMTP (Mailpit in development, a real relay in production) ---
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: booleanFromString('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().min(1).default('Tasks Platform <no-reply@tasks-platform.dev>'),

  // --- Webhook delivery ---
  WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WEBHOOK_MAX_CONSECUTIVE_FAILURES: z.coerce.number().int().positive().default(20),
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
});

export type SharedEnv = z.infer<typeof sharedEnvSchema>;
