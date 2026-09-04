import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { resetDatabase } from '../helpers/db.js';
import { signExpiredAccessToken } from '../helpers/expired-token.js';

const app = buildApp();

const validUser = {
  email: 'Ada.Lovelace@Example.com',
  password: 'correct-horse-battery',
  name: 'Ada Lovelace',
};

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /v1/auth/register', () => {
  it('creates the user with a normalized email and never returns the password hash', async () => {
    const response = await request(app).post('/v1/auth/register').send(validUser);

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('ada.lovelace@example.com');
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(response.body)).not.toContain(validUser.password);
    expect(response.body.accessToken).toEqual(expect.any(String));

    const setCookie = response.headers['set-cookie'];
    expect(setCookie?.[0]).toMatch(/^refresh_token=.+HttpOnly/);
  });

  it('rejects a duplicate email with a conflict', async () => {
    await request(app).post('/v1/auth/register').send(validUser).expect(201);

    const response = await request(app).post('/v1/auth/register').send(validUser);

    expect(response.status).toBe(409);
    expect(response.body.type).toContain('conflict');
  });
});

describe('POST /v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/v1/auth/register').send(validUser);
  });

  it('logs in with the right credentials', async () => {
    const response = await request(app)
      .post('/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('ada.lovelace@example.com');
  });

  it('rejects an unknown email and a wrong password with the exact same error', async () => {
    const wrongPassword = await request(app)
      .post('/v1/auth/login')
      .send({ email: validUser.email, password: 'totally-wrong-password' });

    const unknownEmail = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'totally-wrong-password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.type).toBe(unknownEmail.body.type);
    expect(wrongPassword.body.title).toBe(unknownEmail.body.title);
    expect(wrongPassword.body.detail).toBe(unknownEmail.body.detail);
  });
});

describe('GET /v1/auth/me', () => {
  it('rejects requests without a token', async () => {
    const response = await request(app).get('/v1/auth/me');
    expect(response.status).toBe(401);
  });

  it('rejects an expired access token', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(validUser);
    const userId = registerResponse.body.user.id as string;
    const expiredToken = await signExpiredAccessToken(userId);

    const response = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
  });

  it('returns the profile for a valid token', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(validUser);
    const { accessToken } = registerResponse.body;

    const response = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('ada.lovelace@example.com');
    expect(response.body).not.toHaveProperty('passwordHash');
  });
});
