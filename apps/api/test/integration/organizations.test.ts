import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { resetDatabase } from '../helpers/db.js';

const app = buildApp();

const owner = {
  email: 'katherine.johnson@example.com',
  password: 'correct-horse-battery',
  name: 'Katherine Johnson',
};

const outsider = {
  email: 'dorothy.vaughan@example.com',
  password: 'correct-horse-battery',
  name: 'Dorothy Vaughan',
};

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('organizations', () => {
  it('creates a personal organization on register, and lists it', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(owner);
    const accessToken = registerResponse.body.accessToken as string;

    const listResponse = await request(app)
      .get('/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].slug).toEqual(expect.any(String));
  });

  it('creates an additional organization with a unique slug', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(owner);
    const accessToken = registerResponse.body.accessToken as string;

    const createResponse = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Flight Dynamics' });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.slug).toBe('flight-dynamics');
  });

  it('lets a member fetch the organization by id', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(owner);
    const accessToken = registerResponse.body.accessToken as string;

    const listResponse = await request(app)
      .get('/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`);
    const organizationId = listResponse.body[0].id as string;

    const getResponse = await request(app)
      .get(`/v1/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(organizationId);
  });

  it('returns 404, not 403, for an organization the user does not belong to', async () => {
    const ownerRegisterResponse = await request(app).post('/v1/auth/register').send(owner);
    const ownerToken = ownerRegisterResponse.body.accessToken as string;
    const ownerOrganizations = await request(app)
      .get('/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken}`);
    const ownerOrganizationId = ownerOrganizations.body[0].id as string;

    const outsiderRegisterResponse = await request(app).post('/v1/auth/register').send(outsider);
    const outsiderToken = outsiderRegisterResponse.body.accessToken as string;

    const response = await request(app)
      .get(`/v1/organizations/${ownerOrganizationId}`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(response.status).toBe(404);
  });

  it('returns 404 for a nonexistent organization id', async () => {
    const registerResponse = await request(app).post('/v1/auth/register').send(owner);
    const accessToken = registerResponse.body.accessToken as string;

    const response = await request(app)
      .get('/v1/organizations/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(404);
  });
});
