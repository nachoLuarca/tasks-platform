import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import type * as ConfigModule from '../../src/shared/config/index.js';

// One attempt per window, limiter on, one proxy in front: the setup Render has.
vi.mock('../../src/shared/config/index.js', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('../../src/shared/config/index.js');
  return {
    ...actual,
    config: {
      ...actual.config,
      trustProxyHops: 1,
      rateLimit: { ...actual.config.rateLimit, enabled: true, maxAttempts: 1 },
    },
  };
});

const { buildApp } = await import('../../src/app.js');
const { prisma, redis } = await import('../../src/shared/db/index.js');

const app = buildApp();

afterEach(async () => {
  const keys = await redis.keys('ratelimit:login:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

function login(forwardedFor: string) {
  return request(app)
    .post('/v1/auth/login')
    .set('X-Forwarded-For', forwardedFor)
    .send({ email: 'nobody@example.com', password: 'whatever-password' });
}

describe('rate limiting behind a reverse proxy', () => {
  it('counts attempts per client address, not per proxy', async () => {
    expect((await login('203.0.113.10')).status).toBe(401);
    expect((await login('203.0.113.10')).status).toBe(429);

    // A different client behind the same proxy is not locked out by the first one.
    expect((await login('203.0.113.11')).status).toBe(401);
  });

  it('is not fooled by a client-supplied X-Forwarded-For prefix', async () => {
    expect((await login('198.51.100.1, 203.0.113.20')).status).toBe(401);

    // The hop appended by the trusted proxy is the same, so this is the same client.
    expect((await login('198.51.100.2, 203.0.113.20')).status).toBe(429);
  });
});
