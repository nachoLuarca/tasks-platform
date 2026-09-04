// Tests run the real config loader against real env vars (no mocking), so
// every variable envSchema requires must get a value here. These are fixed,
// evident test values, never real secrets -- pnpm test must pass on a
// machine with no .env file at all (CI has none), so this file must not
// depend on one.
process.env.NODE_ENV ??= 'test';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';
process.env.DATABASE_URL ??= 'postgresql://tasks_platform:tasks_platform@localhost:5432/tasks_platform?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET ??= 'test-only-secret-not-for-real-use-01234567';
process.env.LOG_LEVEL ??= 'silent';
process.env.RATE_LIMIT_ENABLED ??= 'false';
process.env.ARGON2_MEMORY_COST_KIB ??= '1024';
process.env.ARGON2_TIME_COST ??= '2';
process.env.ARGON2_PARALLELISM ??= '1';
