import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { registerAndGetSession, type RegisteredSession } from '../helpers/auth.js';
import { resetDatabase } from '../helpers/db.js';

const app = buildApp();

const owner = { email: 'katherine.johnson@example.com', password: 'correct-horse-battery', name: 'Katherine Johnson' };
const admin = { email: 'dorothy.vaughan@example.com', password: 'correct-horse-battery', name: 'Dorothy Vaughan' };
const member = { email: 'mary.jackson@example.com', password: 'correct-horse-battery', name: 'Mary Jackson' };
const viewer = { email: 'christine.darden@example.com', password: 'correct-horse-battery', name: 'Christine Darden' };
const outsider = { email: 'nichelle.nichols@example.com', password: 'correct-horse-battery', name: 'Nichelle Nichols' };

/** Invites `user` into `organizationId` with `role` and accepts on their behalf. */
async function addMember(
  ownerAccessToken: string,
  organizationId: string,
  user: { email: string; password: string; name: string },
  role: string,
): Promise<RegisteredSession> {
  const invitation = await request(app)
    .post(`/v1/organizations/${organizationId}/invitations`)
    .set('Authorization', `Bearer ${ownerAccessToken}`)
    .send({ email: user.email, role });
  const token = (invitation.body.invitationUrl as string).split('/').pop();

  const session = await registerAndGetSession(app, user);
  await request(app).post(`/v1/invitations/${token}/accept`).set('Authorization', `Bearer ${session.accessToken}`);

  return session;
}

interface Setup {
  owner: RegisteredSession;
  admin: RegisteredSession;
  member: RegisteredSession;
  viewer: RegisteredSession;
  organizationId: string;
}

async function setupOrganizationWithAllRoles(): Promise<Setup> {
  const ownerSession = await registerAndGetSession(app, owner);
  const { organizationId } = ownerSession;

  const adminSession = await addMember(ownerSession.accessToken, organizationId, admin, 'ADMIN');
  const memberSession = await addMember(ownerSession.accessToken, organizationId, member, 'MEMBER');
  const viewerSession = await addMember(ownerSession.accessToken, organizationId, viewer, 'VIEWER');

  return { owner: ownerSession, admin: adminSession, member: memberSession, viewer: viewerSession, organizationId };
}

async function createProject(
  accessToken: string,
  organizationId: string,
  overrides: Partial<{ key: string; name: string; description: string }> = {},
) {
  return request(app)
    .post(`/v1/organizations/${organizationId}/projects`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ key: 'ENG', name: 'Engineering', ...overrides });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('project creation', () => {
  it('creates a project with a valid key', async () => {
    const session = await registerAndGetSession(app, owner);
    const response = await createProject(session.accessToken, session.organizationId);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      key: 'ENG',
      name: 'Engineering',
      status: 'ACTIVE',
      taskCounter: 0,
    });
  });

  it.each(['e', 'ENGINEERING', 'eng', 'EN-G', '1NG'])('rejects an invalid key: %s', async (key) => {
    const session = await registerAndGetSession(app, owner);
    const response = await createProject(session.accessToken, session.organizationId, { key });

    expect(response.status).toBe(400);
  });

  it('rejects a duplicate key within the same organization', async () => {
    const session = await registerAndGetSession(app, owner);
    await createProject(session.accessToken, session.organizationId);

    const response = await createProject(session.accessToken, session.organizationId);

    expect(response.status).toBe(409);
  });

  it('allows the same key in two different organizations', async () => {
    const session = await registerAndGetSession(app, owner);
    const first = await createProject(session.accessToken, session.organizationId);
    expect(first.status).toBe(201);

    const secondOrg = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'Second Org' });

    const second = await createProject(session.accessToken, secondOrg.body.id as string);
    expect(second.status).toBe(201);
  });
});

describe('permission matrix', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['viewer', false],
  ])('project:create -- %s can create: %s', async (roleKey, canCreate) => {
    const setup = await setupOrganizationWithAllRoles();
    const session = setup[roleKey as 'owner' | 'admin' | 'member' | 'viewer'];

    const response = await createProject(session.accessToken, setup.organizationId);
    expect(response.status).toBe(canCreate ? 201 : 403);
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', true],
    ['viewer', true],
  ])('project:read -- %s can read: %s', async (roleKey, canRead) => {
    const setup = await setupOrganizationWithAllRoles();
    const created = await createProject(setup.owner.accessToken, setup.organizationId);
    const session = setup[roleKey as 'owner' | 'admin' | 'member' | 'viewer'];

    const response = await request(app)
      .get(`/v1/organizations/${setup.organizationId}/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(response.status).toBe(canRead ? 200 : 403);
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['viewer', false],
  ])('project:update -- %s can update: %s', async (roleKey, canUpdate) => {
    const setup = await setupOrganizationWithAllRoles();
    const created = await createProject(setup.owner.accessToken, setup.organizationId);
    const session = setup[roleKey as 'owner' | 'admin' | 'member' | 'viewer'];

    const response = await request(app)
      .patch(`/v1/organizations/${setup.organizationId}/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'Renamed' });
    expect(response.status).toBe(canUpdate ? 200 : 403);
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['viewer', false],
  ])('project:delete -- %s can delete: %s', async (roleKey, canDelete) => {
    const setup = await setupOrganizationWithAllRoles();
    const created = await createProject(setup.owner.accessToken, setup.organizationId);
    const session = setup[roleKey as 'owner' | 'admin' | 'member' | 'viewer'];

    const response = await request(app)
      .delete(`/v1/organizations/${setup.organizationId}/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(response.status).toBe(canDelete ? 204 : 403);
  });
});

describe('archive and unarchive', () => {
  it('archives an active project and unarchives it back', async () => {
    const session = await registerAndGetSession(app, owner);
    const created = await createProject(session.accessToken, session.organizationId);

    const archived = await request(app)
      .post(`/v1/organizations/${session.organizationId}/projects/${created.body.id}/archive`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('ARCHIVED');

    const alreadyArchived = await request(app)
      .post(`/v1/organizations/${session.organizationId}/projects/${created.body.id}/archive`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(alreadyArchived.status).toBe(409);

    const unarchived = await request(app)
      .post(`/v1/organizations/${session.organizationId}/projects/${created.body.id}/unarchive`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(unarchived.status).toBe(200);
    expect(unarchived.body.status).toBe('ACTIVE');
  });
});

describe('listing with pagination and status filter', () => {
  it('paginates the full set of projects without repeating or skipping any', async () => {
    const session = await registerAndGetSession(app, owner);
    const keys = ['PAA', 'PAB', 'PAC', 'PAD', 'PAE'];
    for (const key of keys) {
      await createProject(session.accessToken, session.organizationId, { key });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await request(app)
        .get(`/v1/organizations/${session.organizationId}/projects`)
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(response.status).toBe(200);
      seen.push(...(response.body.data as { id: string }[]).map((project) => project.id));
      cursor = response.body.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('filters by status', async () => {
    const session = await registerAndGetSession(app, owner);
    const active = await createProject(session.accessToken, session.organizationId, { key: 'ACT' });
    const toArchive = await createProject(session.accessToken, session.organizationId, { key: 'ARC' });
    await request(app)
      .post(`/v1/organizations/${session.organizationId}/projects/${toArchive.body.id}/archive`)
      .set('Authorization', `Bearer ${session.accessToken}`);

    const response = await request(app)
      .get(`/v1/organizations/${session.organizationId}/projects`)
      .query({ status: 'ACTIVE' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    const ids = (response.body.data as { id: string }[]).map((project) => project.id);
    expect(ids).toContain(active.body.id);
    expect(ids).not.toContain(toArchive.body.id);
  });
});

describe('non-member access', () => {
  it('returns 404, not 403, on every project route for a non-member', async () => {
    const session = await registerAndGetSession(app, owner);
    const created = await createProject(session.accessToken, session.organizationId);
    const outsiderSession = await registerAndGetSession(app, outsider);
    const auth = { Authorization: `Bearer ${outsiderSession.accessToken}` };

    const responses = await Promise.all([
      request(app).get(`/v1/organizations/${session.organizationId}/projects`).set(auth),
      request(app).post(`/v1/organizations/${session.organizationId}/projects`).set(auth).send({ key: 'OUT', name: 'x' }),
      request(app).get(`/v1/organizations/${session.organizationId}/projects/${created.body.id}`).set(auth),
      request(app)
        .patch(`/v1/organizations/${session.organizationId}/projects/${created.body.id}`)
        .set(auth)
        .send({ name: 'x' }),
      request(app).delete(`/v1/organizations/${session.organizationId}/projects/${created.body.id}`).set(auth),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
    }
  });
});
