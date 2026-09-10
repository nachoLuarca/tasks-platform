import { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';
import { usersRepository } from '../../src/modules/users/users.repository.js';
import { prisma } from '../../src/shared/db/index.js';
import { expireAccountTokens, issueAccountToken } from '../helpers/account-tokens.js';
import { resetDatabase } from '../helpers/db.js';

const app = buildApp();

const user = { email: 'hedy.lamarr@example.com', password: 'correct-horse-battery', name: 'Hedy Lamarr' };
const NEW_PASSWORD = 'frequency-hopping-spread-spectrum';
const UNKNOWN_EMAIL = 'no-account-here@example.com';

function extractCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as unknown as string[];
  const cookie = setCookie?.[0];
  if (!cookie) {
    throw new Error('Expected a Set-Cookie header');
  }
  return cookie.split(';')[0]!;
}

/** Headers that differ between *any* two requests, whatever they are -- not something the address could influence. */
const PER_REQUEST_HEADERS = new Set(['date', 'x-request-id']);

function stableHeaders(response: request.Response): Record<string, unknown> {
  return Object.fromEntries(Object.entries(response.headers).filter(([name]) => !PER_REQUEST_HEADERS.has(name)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function registerUser(): Promise<{ userId: string; cookie: string }> {
  const response = await request(app).post('/v1/auth/register').send(user);
  return { userId: response.body.user.id as string, cookie: extractCookie(response) };
}

function forgotPassword(email: string) {
  return request(app).post('/v1/auth/forgot-password').send({ email });
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /v1/auth/forgot-password', () => {
  it('answers a registered and an unregistered address with the same status, headers and body', async () => {
    await registerUser();

    const known = await forgotPassword(user.email);
    const unknown = await forgotPassword(UNKNOWN_EMAIL);

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(known.status);
    expect(unknown.text).toBe(known.text);
    expect(stableHeaders(unknown)).toEqual(stableHeaders(known));
    expect(known.body).toEqual({ message: expect.any(String) });
  });

  it('does the same work for both: never looks the address up, enqueues exactly one job each', async () => {
    await registerUser();
    const lookup = vi.spyOn(usersRepository, 'findByEmail');
    const enqueue = vi.spyOn(Queue.prototype, 'add');

    await forgotPassword(user.email);
    await forgotPassword(UNKNOWN_EMAIL);

    expect(lookup).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenNthCalledWith(1, 'password-reset-request', { email: user.email }, expect.anything());
    expect(enqueue).toHaveBeenNthCalledWith(2, 'password-reset-request', { email: UNKNOWN_EMAIL }, expect.anything());
  });

  it('takes comparable time for a registered and an unregistered address', async () => {
    await registerUser();
    const timed = async (email: string): Promise<number> => {
      const start = performance.now();
      await forgotPassword(email);
      return performance.now() - start;
    };

    await timed(user.email);
    await timed(UNKNOWN_EMAIL);

    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      known.push(await timed(user.email));
      unknown.push(await timed(`nobody-${i}@example.com`));
    }

    // The previous test is the structural proof (identical code path). This
    // one measures it: interleaved samples, medians to shrug off GC pauses,
    // and a tolerance well below the cost of the account-dependent work the
    // worker does instead (a lookup, a count, an insert and an enqueue).
    expect(Math.abs(median(known) - median(unknown))).toBeLessThan(5);
  });

  it('normalizes the address before enqueueing, so casing cannot be used to tell accounts apart either', async () => {
    const enqueue = vi.spyOn(Queue.prototype, 'add');
    await forgotPassword('  Hedy.Lamarr@Example.com ');
    expect(enqueue.mock.calls[0]?.[1]).toEqual({ email: user.email });
  });
});

describe('GET /v1/auth/reset-password/:token', () => {
  it('confirms a usable token, with its expiry about an hour out, without consuming it', async () => {
    const { userId } = await registerUser();
    const token = await issueAccountToken('password-reset', userId);

    const first = await request(app).get(`/v1/auth/reset-password/${token}`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ valid: true, expiresAt: expect.any(String) });
    const remainingMs = new Date(first.body.expiresAt as string).getTime() - Date.now();
    expect(remainingMs).toBeGreaterThan(55 * 60 * 1000);
    expect(remainingMs).toBeLessThanOrEqual(60 * 60 * 1000);

    const second = await request(app).get(`/v1/auth/reset-password/${token}`);
    expect(second.status).toBe(200);

    const reset = await request(app).post('/v1/auth/reset-password').send({ token, newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(204);
  });

  it('answers the same 404 for an unknown, an expired and an already used token', async () => {
    const { userId } = await registerUser();

    const unknown = await request(app).get('/v1/auth/reset-password/not-a-token-anyone-issued');

    const expiredToken = await issueAccountToken('password-reset', userId);
    await expireAccountTokens('password-reset', userId);
    const expired = await request(app).get(`/v1/auth/reset-password/${expiredToken}`);

    const usedToken = await issueAccountToken('password-reset', userId);
    await request(app).post('/v1/auth/reset-password').send({ token: usedToken, newPassword: NEW_PASSWORD }).expect(204);
    const used = await request(app).get(`/v1/auth/reset-password/${usedToken}`);

    for (const response of [unknown, expired, used]) {
      expect(response.status).toBe(404);
      expect(response.body.detail).toBe(unknown.body.detail);
    }
  });
});

describe('POST /v1/auth/reset-password', () => {
  it('sets the new password: it logs in, and the old one no longer does', async () => {
    const { userId } = await registerUser();
    const token = await issueAccountToken('password-reset', userId);

    await request(app).post('/v1/auth/reset-password').send({ token, newPassword: NEW_PASSWORD }).expect(204);

    const withNew = await request(app).post('/v1/auth/login').send({ email: user.email, password: NEW_PASSWORD });
    const withOld = await request(app).post('/v1/auth/login').send({ email: user.email, password: user.password });
    expect(withNew.status).toBe(200);
    expect(withOld.status).toBe(401);
  });

  it('leaves every previous session unusable -- including the one the reset was requested from', async () => {
    const { userId, cookie: registrationSession } = await registerUser();
    const otherLogin = await request(app).post('/v1/auth/login').send({ email: user.email, password: user.password });
    const otherDeviceSession = extractCookie(otherLogin);

    const token = await issueAccountToken('password-reset', userId);
    const reset = await request(app)
      .post('/v1/auth/reset-password')
      .set('Cookie', registrationSession)
      .send({ token, newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(204);

    // The browser that sent the reset is told to drop its now-dead cookie.
    const cleared = (reset.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
    expect(cleared).toMatch(/^refresh_token=;/);

    // Unlike POST /v1/users/me/password (see users.test.ts), no session
    // survives: not the one making the request, not any other.
    const refreshFromRequester = await request(app).post('/v1/auth/refresh').set('Cookie', registrationSession);
    const refreshFromOtherDevice = await request(app).post('/v1/auth/refresh').set('Cookie', otherDeviceSession);
    expect(refreshFromRequester.status).toBe(401);
    expect(refreshFromOtherDevice.status).toBe(401);

    expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it('a used reset token does not work twice', async () => {
    const { userId } = await registerUser();
    const token = await issueAccountToken('password-reset', userId);

    await request(app).post('/v1/auth/reset-password').send({ token, newPassword: NEW_PASSWORD }).expect(204);
    const reuse = await request(app)
      .post('/v1/auth/reset-password')
      .send({ token, newPassword: 'someone-else-wants-in-too' });
    expect(reuse.status).toBe(404);

    const login = await request(app).post('/v1/auth/login').send({ email: user.email, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
  });

  it('rejects an expired token and changes nothing: old password and sessions still work', async () => {
    const { userId, cookie } = await registerUser();
    const token = await issueAccountToken('password-reset', userId);
    await expireAccountTokens('password-reset', userId);

    const response = await request(app).post('/v1/auth/reset-password').send({ token, newPassword: NEW_PASSWORD });
    expect(response.status).toBe(404);

    const login = await request(app).post('/v1/auth/login').send({ email: user.email, password: user.password });
    expect(login.status).toBe(200);
    const refresh = await request(app).post('/v1/auth/refresh').set('Cookie', cookie);
    expect(refresh.status).toBe(200);
  });

  it('using one reset link kills the other outstanding ones', async () => {
    const { userId } = await registerUser();
    const older = await issueAccountToken('password-reset', userId);
    const newer = await issueAccountToken('password-reset', userId);

    await request(app).post('/v1/auth/reset-password').send({ token: newer, newPassword: NEW_PASSWORD }).expect(204);

    const olderCheck = await request(app).get(`/v1/auth/reset-password/${older}`);
    expect(olderCheck.status).toBe(404);
  });

  it('rejects a too-short new password with 400 without consuming the token', async () => {
    const { userId } = await registerUser();
    const token = await issueAccountToken('password-reset', userId);

    const response = await request(app).post('/v1/auth/reset-password').send({ token, newPassword: 'short' });
    expect(response.status).toBe(400);

    const check = await request(app).get(`/v1/auth/reset-password/${token}`);
    expect(check.status).toBe(200);
  });

  it('never echoes the token, and masks it when it shows up in an unknown path', async () => {
    const { userId } = await registerUser();
    const token = await issueAccountToken('password-reset', userId);

    const check = await request(app).get(`/v1/auth/reset-password/${token}`);
    const reset = await request(app).post('/v1/auth/reset-password').send({ token, newPassword: NEW_PASSWORD });
    const unknownRoute = await request(app).get(`/v1/auth/reset-password/${token}/extra`);

    for (const response of [check, reset, unknownRoute]) {
      expect(response.text).not.toContain(token);
    }
    expect(unknownRoute.status).toBe(404);
    expect(unknownRoute.body.detail).toContain('[REDACTED]');
  });
});
