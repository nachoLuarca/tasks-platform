// Same idea as apps/api/test/setup-env.ts: the real config loader runs
// against real env vars, no mocking, so `pnpm test` must pass with no .env
// file at all (CI has none). SMTP points at the real Mailpit container from
// docker-compose.yml (published on localhost) so the email test proves an
// actual delivery, not a mocked transport.
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.DATABASE_URL ??= 'postgresql://tasks_platform:tasks_platform@localhost:5432/tasks_platform?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.APP_PUBLIC_URL ??= 'http://localhost:3000';
process.env.SMTP_HOST ??= 'localhost';
process.env.SMTP_PORT ??= '1025';
process.env.SMTP_SECURE ??= 'false';
process.env.WEBHOOK_DELIVERY_TIMEOUT_MS ??= '2000';
process.env.WEBHOOK_MAX_CONSECUTIVE_FAILURES ??= '20';
process.env.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS ??= '300';
process.env.WORKER_PORT ??= '3101';
process.env.OUTBOX_POLL_INTERVAL_MS ??= '2000';
