import { z } from 'zod';

/** Worker-only settings. Everything else (db, redis, smtp, ...) comes from `sharedConfig` -- see config.ts. */
export const workerEnvSchema = z.object({
  WORKER_PORT: z.coerce.number().int().positive().default(3100),
  /** How often the dispatcher polls the outbox for pending events. */
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2_000),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;
