import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { resetDatabase } from '../helpers/db.js';

const app = buildApp();

const user = {
  email: 'margaret.hamilton@example.com',
  password: 'correct-horse-battery',
  name: 'Margaret Hamilton',
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

describe('PATCH /v1/users/me', () => {
  it('updates the display name', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(user);
    const accessToken = registerResponse.body.accessToken as string;

    const response = await request(app)
      .patch('/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Meg Hamilton' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Meg Hamilton');
  });
});

describe('POST /v1/users/me/password', () => {
  it('changes the password and revokes every other session but the current one', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(user);
    const currentSessionCookie = extractCookie(registerResponse);
    const accessToken = registerResponse.body.accessToken as string;

    const otherSessionLogin = await request(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: user.password });
    const otherSessionCookie = extractCookie(otherSessionLogin);

    const changePasswordResponse = await request(app)
      .post('/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', currentSessionCookie)
      .send({ currentPassword: user.password, newPassword: 'brand-new-password-99' });

    expect(changePasswordResponse.status).toBe(204);
    expect(JSON.stringify(changePasswordResponse.body ?? {})).not.toContain(user.password);

    const currentSessionRefresh = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', currentSessionCookie);
    expect(currentSessionRefresh.status).toBe(200);

    const otherSessionRefresh = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', otherSessionCookie);
    expect(otherSessionRefresh.status).toBe(401);
  });

  it('rejects the wrong current password', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(user);
    const accessToken = registerResponse.body.accessToken as string;

    const response = await request(app)
      .post('/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'not-the-right-password', newPassword: 'brand-new-password-99' });

    expect(response.status).toBe(401);
  });
});
