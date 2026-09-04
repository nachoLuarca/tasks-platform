import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { resetDatabase } from '../helpers/db.js';

const app = buildApp();

const user = {
  email: 'grace.hopper@example.com',
  password: 'correct-horse-battery',
  name: 'Grace Hopper',
};

function extractCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as unknown as string[];
  const cookie = setCookie?.[0];
  if (!cookie) {
    throw new Error('Expected a Set-Cookie header');
  }
  return cookie.split(';')[0]!;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /v1/auth/refresh', () => {
  it('rotates the token: the old one stops working, the new one works', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(user);
    const originalCookie = extractCookie(registerResponse);

    const firstRefresh = await request(app).post('/v1/auth/refresh').set('Cookie', originalCookie);
    expect(firstRefresh.status).toBe(200);
    const rotatedCookie = extractCookie(firstRefresh);
    expect(rotatedCookie).not.toBe(originalCookie);

    // The new token works for the next rotation...
    const secondRefreshWithNewCookie = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', rotatedCookie);
    expect(secondRefreshWithNewCookie.status).toBe(200);

    // ...while the original one, already consumed, no longer does.
    const reuseOldCookie = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', originalCookie);
    expect(reuseOldCookie.status).toBe(401);
  });

  it('revokes the whole family when a revoked token is reused', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(user);
    const originalCookie = extractCookie(registerResponse);

    const rotated = await request(app).post('/v1/auth/refresh').set('Cookie', originalCookie);
    const rotatedCookie = extractCookie(rotated);

    // Reusing the already-rotated (now revoked) token: theft signal.
    const reuse = await request(app).post('/v1/auth/refresh').set('Cookie', originalCookie);
    expect(reuse.status).toBe(401);

    // The token that reuse would have produced next is also dead now,
    // because the whole family was revoked, not just the reused token.
    const rotatedNowDead = await request(app).post('/v1/auth/refresh').set('Cookie', rotatedCookie);
    expect(rotatedNowDead.status).toBe(401);
  });

  it('rejects a missing refresh token', async () => {
    const response = await request(app).post('/v1/auth/refresh');
    expect(response.status).toBe(401);
  });
});

describe('POST /v1/auth/logout', () => {
  it('invalidates the refresh token', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(user);
    const cookie = extractCookie(registerResponse);

    const logoutResponse = await request(app).post('/v1/auth/logout').set('Cookie', cookie);
    expect(logoutResponse.status).toBe(204);

    const refreshAfterLogout = await request(app).post('/v1/auth/refresh').set('Cookie', cookie);
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('is a no-op when there is no cookie, rather than an error', async () => {
    const response = await request(app).post('/v1/auth/logout');
    expect(response.status).toBe(204);
  });
});

describe('POST /v1/auth/logout-all', () => {
  it('revokes every session for the user', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(user);
    const cookieA = extractCookie(registerResponse);
    const accessToken = registerResponse.body.accessToken as string;

    const loginResponse = await request(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: user.password });
    const cookieB = extractCookie(loginResponse);

    const logoutAllResponse = await request(app)
      .post('/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(logoutAllResponse.status).toBe(204);

    const refreshA = await request(app).post('/v1/auth/refresh').set('Cookie', cookieA);
    const refreshB = await request(app).post('/v1/auth/refresh').set('Cookie', cookieB);
    expect(refreshA.status).toBe(401);
    expect(refreshB.status).toBe(401);
  });
});
