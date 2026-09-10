import { z } from 'zod';

/** Worker-only settings. Everything else (db, redis, smtp, ...) comes from `sharedConfig` -- see config.ts. */
export const workerEnvSchema = z.object({
  WORKER_PORT: z.coerce.number().int().positive().default(3100),
  /** How often the dispatcher polls the outbox for pending events. */
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2_000),
  /**
   * Per-account ceiling on password-reset emails in any rolling hour.
   * Enforced here, not in the api, and silently (the request is dropped, not
   * refused), so it never tells the requester whether the address exists --
   * see services/password-reset.service.ts.
   */
  PASSWORD_RESET_MAX_PER_HOUR: z.coerce.number().int().positive().default(3),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;
