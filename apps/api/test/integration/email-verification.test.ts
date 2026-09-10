import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { expireAccountTokens, issueAccountToken } from '../helpers/account-tokens.js';
import { registerAndGetSession } from '../helpers/auth.js';
import { resetDatabase } from '../helpers/db.js';
import { addMember } from '../helpers/members.js';

const app = buildApp();

const user = { email: 'katherine.johnson@example.com', password: 'correct-horse-battery', name: 'Katherine Johnson' };
const inviter = { email: 'dorothy.vaughan@example.com', password: 'correct-horse-battery', name: 'Dorothy Vaughan' };

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function getMe(accessToken: string): Promise<request.Response> {
  return request(app).get('/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
}

describe('registration', () => {
  it('issues a verification token and leaves the account unverified -- but fully usable', async () => {
    const session = await registerAndGetSession(app, user);

    expect(await prisma.verificationToken.count({ where: { userId: session.userId } })).toBe(1);

    const me = await getMe(session.accessToken);
    expect(me.status).toBe(200);
    expect(me.body.emailVerifiedAt).toBeNull();

    // Not gated (PHASE.md decision 1): an unverified account creates a
    // project and a task like any other.
    const project = await request(app)
      .post(`/v1/organizations/${session.organizationId}/projects`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ key: 'NASA', name: 'Trajectories' });
    expect(project.status).toBe(201);
    const task = await request(app)
      .post(`/v1/organizations/${session.organizationId}/projects/${project.body.id}/tasks`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ title: 'Check the numbers' });
    expect(task.status).toBe(201);
  });
});

describe('POST /v1/auth/verify-email', () => {
  it('consumes the token, marks the address verified, and GET /me exposes it', async () => {
    const session = await registerAndGetSession(app, user);
    const token = await issueAccountToken('email-verification', session.userId);

    const response = await request(app).post('/v1/auth/verify-email').send({ token });
    expect(response.status).toBe(204);
    expect(response.text).toBe('');

    const me = await getMe(session.accessToken);
    expect(me.body.emailVerifiedAt).toEqual(expect.any(String));
  });

  it('a verification token does not work twice', async () => {
    const session = await registerAndGetSession(app, user);
    const token = await issueAccountToken('email-verification', session.userId);

    await request(app).post('/v1/auth/verify-email').send({ token }).expect(204);
    const reuse = await request(app).post('/v1/auth/verify-email').send({ token });
    expect(reuse.status).toBe(404);
  });

  it('rejects an expired token with the same 404 as an unknown one, and verifies nothing', async () => {
    const session = await registerAndGetSession(app, user);
    const token = await issueAccountToken('email-verification', session.userId);
    await expireAccountTokens('email-verification', session.userId);

    const expired = await request(app).post('/v1/auth/verify-email').send({ token });
    const unknown = await request(app).post('/v1/auth/verify-email').send({ token: 'not-a-token-anyone-issued' });

    expect(expired.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(expired.body.detail).toBe(unknown.body.detail);
    expect((await getMe(session.accessToken)).body.emailVerifiedAt).toBeNull();
  });

  it('once verified, the other outstanding verification links stop working', async () => {
    const session = await registerAndGetSession(app, user);
    const first = await issueAccountToken('email-verification', session.userId);
    const second = await issueAccountToken('email-verification', session.userId);

    await request(app).post('/v1/auth/verify-email').send({ token: first }).expect(204);
    const stale = await request(app).post('/v1/auth/verify-email').send({ token: second });
    expect(stale.status).toBe(404);
  });
});

describe('POST /v1/auth/resend-verification', () => {
  it('queues a new email while under the hourly cap, then answers 429 with Retry-After', async () => {
    const session = await registerAndGetSession(app, user);
    const resend = () =>
      request(app).post('/v1/auth/resend-verification').set('Authorization', `Bearer ${session.accessToken}`);

    // The registration email counts toward the cap of 3 per hour.
    const first = await resend();
    const second = await resend();
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.text).toBe('');

    const third = await resend();
    expect(third.status).toBe(429);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);

    expect(await prisma.verificationToken.count({ where: { userId: session.userId } })).toBe(3);
  });

  it('answers 409 once the address is already verified', async () => {
    const session = await registerAndGetSession(app, user);
    const token = await issueAccountToken('email-verification', session.userId);
    await request(app).post('/v1/auth/verify-email').send({ token }).expect(204);

    const response = await request(app)
      .post('/v1/auth/resend-verification')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(response.status).toBe(409);
  });

  it('requires a session', async () => {
    const response = await request(app).post('/v1/auth/resend-verification');
    expect(response.status).toBe(401);
  });
});

describe('accepting an invitation', () => {
  it('marks the email verified, with no verification token involved', async () => {
    const inviterSession = await registerAndGetSession(app, inviter);
    const invitee = await addMember(app, inviterSession.accessToken, inviterSession.organizationId, user, 'MEMBER');

    const me = await getMe(invitee.accessToken);
    expect(me.body.emailVerifiedAt).toEqual(expect.any(String));

    // The registration token is still there, unused: acceptance didn't go through it.
    const tokens = await prisma.verificationToken.findMany({ where: { userId: invitee.userId } });
    expect(tokens.every((token) => token.usedAt === null)).toBe(true);
  });
});
