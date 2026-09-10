import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { registerAndGetSession, type RegisteredSession } from '../helpers/auth.js';
import { resetDatabase } from '../helpers/db.js';
import { getInvitationToken } from '../helpers/invitations.js';

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
  await request(app)
    .post(`/v1/organizations/${organizationId}/invitations`)
    .set('Authorization', `Bearer ${ownerAccessToken}`)
    .send({ email: user.email, role });
  const token = await getInvitationToken(user.email);

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

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('permission matrix', () => {
  it('every role can list members, including VIEWER', async () => {
    const setup = await setupOrganizationWithAllRoles();

    for (const session of [setup.owner, setup.admin, setup.member, setup.viewer]) {
      const response = await request(app)
        .get(`/v1/organizations/${setup.organizationId}/members`)
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(4);
    }
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['viewer', false],
  ])('organization:update -- %s can update: %s', async (roleKey, canUpdate) => {
    const setup = await setupOrganizationWithAllRoles();
    const session = setup[roleKey as 'owner' | 'admin' | 'member' | 'viewer'];

    const response = await request(app)
      .patch(`/v1/organizations/${setup.organizationId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'Renamed' });

    expect(response.status).toBe(canUpdate ? 200 : 403);
  });

  it.each([
    ['owner', true],
    ['admin', false],
    ['member', false],
    ['viewer', false],
  ])('organization:delete -- %s can delete: %s', async (roleKey, canDelete) => {
    const setup = await setupOrganizationWithAllRoles();
    const session = setup[roleKey as 'owner' | 'admin' | 'member' | 'viewer'];

    const response = await request(app)
      .delete(`/v1/organizations/${setup.organizationId}`)
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(canDelete ? 204 : 403);
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['viewer', false],
  ])('invitation:create -- %s can invite: %s', async (roleKey, canInvite) => {
    const setup = await setupOrganizationWithAllRoles();
    const session = setup[roleKey as 'owner' | 'admin' | 'member' | 'viewer'];

    const response = await request(app)
      .post(`/v1/organizations/${setup.organizationId}/invitations`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ email: outsider.email, role: 'MEMBER' });

    expect(response.status).toBe(canInvite ? 201 : 403);
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['viewer', false],
  ])('member:remove -- %s can remove another member: %s', async (roleKey, canRemove) => {
    const setup = await setupOrganizationWithAllRoles();
    const session = setup[roleKey as 'owner' | 'admin' | 'member' | 'viewer'];

    const response = await request(app)
      .delete(`/v1/organizations/${setup.organizationId}/members/${setup.viewer.userId}`)
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(canRemove ? 204 : 403);
  });

  it.each([
    ['owner', true],
    ['admin', false],
    ['member', false],
    ['viewer', false],
  ])('ownership:transfer -- %s can transfer ownership: %s', async (roleKey, canTransfer) => {
    const setup = await setupOrganizationWithAllRoles();
    const session = setup[roleKey as 'owner' | 'admin' | 'member' | 'viewer'];

    const response = await request(app)
      .post(`/v1/organizations/${setup.organizationId}/transfer-ownership`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ userId: setup.admin.userId });

    // A non-owner is rejected by the permission check (403) before the
    // handler ever runs, so it never gets the chance to reject for being a
    // non-owner target instead.
    expect(response.status).toBe(canTransfer ? 204 : 403);
  });
});

describe('owner invariants', () => {
  it('cannot demote the only owner', async () => {
    const ownerSession = await registerAndGetSession(app, owner);

    const response = await request(app)
      .patch(`/v1/organizations/${ownerSession.organizationId}/members/${ownerSession.userId}`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(409);
  });

  it('cannot remove the only owner', async () => {
    const ownerSession = await registerAndGetSession(app, owner);

    const response = await request(app)
      .delete(`/v1/organizations/${ownerSession.organizationId}/members/${ownerSession.userId}`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`);

    expect(response.status).toBe(409);
  });

  it('the owner cannot leave without transferring ownership first', async () => {
    const ownerSession = await registerAndGetSession(app, owner);

    const response = await request(app)
      .delete(`/v1/organizations/${ownerSession.organizationId}/members/me`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`);

    expect(response.status).toBe(409);
  });

  it('an admin cannot change the role of the owner', async () => {
    const setup = await setupOrganizationWithAllRoles();

    const response = await request(app)
      .patch(`/v1/organizations/${setup.organizationId}/members/${setup.owner.userId}`)
      .set('Authorization', `Bearer ${setup.admin.accessToken}`)
      .send({ role: 'MEMBER' });

    expect(response.status).toBe(409);
  });

  it('an admin cannot remove the owner', async () => {
    const setup = await setupOrganizationWithAllRoles();

    const response = await request(app)
      .delete(`/v1/organizations/${setup.organizationId}/members/${setup.owner.userId}`)
      .set('Authorization', `Bearer ${setup.admin.accessToken}`);

    expect(response.status).toBe(409);
  });

  it('transferring ownership demotes the previous owner to ADMIN and promotes the target', async () => {
    const setup = await setupOrganizationWithAllRoles();

    const response = await request(app)
      .post(`/v1/organizations/${setup.organizationId}/transfer-ownership`)
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ userId: setup.member.userId });
    expect(response.status).toBe(204);

    const membersResponse = await request(app)
      .get(`/v1/organizations/${setup.organizationId}/members`)
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const members = membersResponse.body as { userId: string; role: string }[];
    expect(members.find((m) => m.userId === setup.owner.userId)?.role).toBe('ADMIN');
    expect(members.find((m) => m.userId === setup.member.userId)?.role).toBe('OWNER');
  });

  it('a non-owner member can leave freely', async () => {
    const setup = await setupOrganizationWithAllRoles();

    const response = await request(app)
      .delete(`/v1/organizations/${setup.organizationId}/members/me`)
      .set('Authorization', `Bearer ${setup.member.accessToken}`);

    expect(response.status).toBe(204);
  });
});

describe('non-member access', () => {
  it('returns 404, not 403, on every organization-scoped route for a non-member', async () => {
    const ownerSession = await registerAndGetSession(app, owner);
    const outsiderSession = await registerAndGetSession(app, outsider);
    const { organizationId } = ownerSession;
    const auth = { Authorization: `Bearer ${outsiderSession.accessToken}` };

    const responses = await Promise.all([
      request(app).get(`/v1/organizations/${organizationId}`).set(auth),
      request(app).patch(`/v1/organizations/${organizationId}`).set(auth).send({ name: 'x' }),
      request(app).delete(`/v1/organizations/${organizationId}`).set(auth),
      request(app).get(`/v1/organizations/${organizationId}/members`).set(auth),
      request(app)
        .patch(`/v1/organizations/${organizationId}/members/${ownerSession.userId}`)
        .set(auth)
        .send({ role: 'ADMIN' }),
      request(app).delete(`/v1/organizations/${organizationId}/members/${ownerSession.userId}`).set(auth),
      request(app).delete(`/v1/organizations/${organizationId}/members/me`).set(auth),
      request(app)
        .post(`/v1/organizations/${organizationId}/transfer-ownership`)
        .set(auth)
        .send({ userId: outsiderSession.userId }),
      request(app).get(`/v1/organizations/${organizationId}/invitations`).set(auth),
      request(app)
        .post(`/v1/organizations/${organizationId}/invitations`)
        .set(auth)
        .send({ email: 'x@example.com', role: 'MEMBER' }),
      request(app).delete(`/v1/organizations/${organizationId}/invitations/00000000-0000-0000-0000-000000000000`).set(auth),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
    }
  });
});
