import { sharedConfig } from '@tasks-platform/shared';

import { workerEnvSchema } from './env.schema.js';

function loadConfig() {
  const result = workerEnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  const env = result.data;

  return Object.freeze({
    ...sharedConfig,
    port: env.WORKER_PORT,
    outboxPollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
  });
}

export const config = loadConfig();
export type WorkerConfig = typeof config;
