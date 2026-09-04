import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    setupFiles: ['./test/setup-env.ts'],
    // Integration tests share one real Postgres database and reset it
    // between cases; running test files in parallel would let them stomp on
    // each other's data.
    fileParallelism: false,
  },
});
