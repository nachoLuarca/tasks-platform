import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    setupFiles: ['./test/setup-env.ts'],
    // Same reason as apps/api: these tests share one real Postgres/Redis and
    // reset state between cases, so running files in parallel would let
    // them stomp on each other.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
