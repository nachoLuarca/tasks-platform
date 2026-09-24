import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as ConfigModule from '../../src/shared/config/index.js';
import type * as DbModule from '../../src/shared/db/index.js';

// The limiter is off in tests (RATE_LIMIT_ENABLED=false) and the real Redis
// the suite talks to is up, so both have to be replaced to reach the branch
// under test: the one where Redis is unreachable.
vi.mock('../../src/shared/config/index.js', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('../../src/shared/config/index.js');
  return {
    ...actual,
    config: { ...actual.config, rateLimit: { ...actual.config.rateLimit, enabled: true } },
  };
});

vi.mock('../../src/shared/db/index.js', async () => {
  const actual = await vi.importActual<typeof DbModule>('../../src/shared/db/index.js');
  return {
    ...actual,
    // What ioredis throws once `commandTimeout` expires on a command it could
    // not send -- see packages/shared/src/db/redis-options.ts.
    redis: { incr: vi.fn().mockRejectedValue(new Error('Command timed out')) },
  };
});

const { createRateLimiter } = await import('../../src/shared/http/index.js');
const { errorHandler } = await import('../../src/shared/errors/index.js');

function appWithLimiter() {
  const app = express();
  app.post('/probe', createRateLimiter('probe'), (_req, res) => {
    res.status(204).end();
  });
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('rate limiter with Redis unreachable', () => {
  it('refuses the request with 503 Problem Details instead of waving it through', async () => {
    const response = await request(appWithLimiter()).post('/probe');

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'https://tasks-platform.dev/errors/service-unavailable',
      title: 'Service Unavailable',
      status: 503,
    });
  });

  it('answers quickly rather than waiting out the outage', async () => {
    const startedAt = Date.now();

    await request(appWithLimiter()).post('/probe');

    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
