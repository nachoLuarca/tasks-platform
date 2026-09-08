import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { registerAndGetSession } from '../helpers/auth.js';
import { resetDatabase } from '../helpers/db.js';
import { getInvitationToken } from '../helpers/invitations.js';

const app = buildApp();

const owner = { email: 'grace.hopper@example.com', password: 'correct-horse-battery', name: 'Grace Hopper' };
const invitee = { email: 'margaret.hamilton@example.com', password: 'correct-horse-battery', name: 'Margaret Hamilton' };
const outsider = { email: 'annie.easley@example.com', password: 'correct-horse-battery', name: 'Annie Easley' };

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createInvitation(accessToken: string, organizationId: string, email: string, role = 'MEMBER') {
  return request(app)
    .post(`/v1/organizations/${organizationId}/invitations`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ email, role });
}

describe('invitations', () => {
  it('creates an invitation, queues the invitation email, and lists it as pending', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);

    const createResponse = await createInvitation(accessToken, organizationId, invitee.email);
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.email).toBe(invitee.email);
    expect(createResponse.body.invitationUrl).toBeUndefined();
    const token = await getInvitationToken(invitee.email);
    expect(token).toBeTruthy();

    const listResponse = await request(app)
      .get(`/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].id).toBe(createResponse.body.id);
  });

  it('rejects inviting someone who is already a member with a conflict', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);
    await createInvitation(accessToken, organizationId, invitee.email).then((r) => expect(r.status).toBe(201));

    // Same email is already the owner of this organization.
    const response = await createInvitation(accessToken, organizationId, owner.email);
    expect(response.status).toBe(409);
  });

  it('rejects a second pending invitation for the same email', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);
    await createInvitation(accessToken, organizationId, invitee.email);

    const response = await createInvitation(accessToken, organizationId, invitee.email);
    expect(response.status).toBe(409);
  });

  it('lets the owner revoke a pending invitation', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);
    const created = await createInvitation(accessToken, organizationId, invitee.email);

    const revokeResponse = await request(app)
      .delete(`/v1/organizations/${organizationId}/invitations/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(revokeResponse.status).toBe(204);

    const listResponse = await request(app)
      .get(`/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listResponse.body).toHaveLength(0);
  });

  it('shows a public preview with only organization, inviter and role', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);
    const created = await createInvitation(accessToken, organizationId, invitee.email, 'ADMIN');
    const token = await getInvitationToken(invitee.email);

    const response = await request(app).get(`/v1/invitations/${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      organizationName: expect.any(String),
      invitedByName: owner.name,
      role: 'ADMIN',
    });
  });

  it('returns 404 for an unknown invitation token', async () => {
    const response = await request(app).get('/v1/invitations/does-not-exist');
    expect(response.status).toBe(404);
  });

  it('accepts an invitation with the matching account and grants the offered role', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);
    const created = await createInvitation(accessToken, organizationId, invitee.email, 'MEMBER');
    const token = await getInvitationToken(invitee.email);

    const inviteeSession = await registerAndGetSession(app, invitee);

    const acceptResponse = await request(app)
      .post(`/v1/invitations/${token}/accept`)
      .set('Authorization', `Bearer ${inviteeSession.accessToken}`);
    expect(acceptResponse.status).toBe(204);

    const membersResponse = await request(app)
      .get(`/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`);
    const members = membersResponse.body as { userId: string; role: string }[];
    const member = members.find((m) => m.userId === inviteeSession.userId);
    expect(member?.role).toBe('MEMBER');
  });

  it('rejects acceptance from an account with a different email', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);
    const created = await createInvitation(accessToken, organizationId, invitee.email);
    const token = await getInvitationToken(invitee.email);

    const outsiderSession = await registerAndGetSession(app, outsider);

    const response = await request(app)
      .post(`/v1/invitations/${token}/accept`)
      .set('Authorization', `Bearer ${outsiderSession.accessToken}`);
    expect(response.status).toBe(403);
  });

  it('rejects acceptance of an already-used invitation', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);
    const created = await createInvitation(accessToken, organizationId, invitee.email);
    const token = await getInvitationToken(invitee.email);
    const inviteeSession = await registerAndGetSession(app, invitee);

    await request(app)
      .post(`/v1/invitations/${token}/accept`)
      .set('Authorization', `Bearer ${inviteeSession.accessToken}`)
      .expect(204);

    const response = await request(app)
      .post(`/v1/invitations/${token}/accept`)
      .set('Authorization', `Bearer ${inviteeSession.accessToken}`);
    expect(response.status).toBe(409);
  });

  it('rejects acceptance of a revoked invitation', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);
    const created = await createInvitation(accessToken, organizationId, invitee.email);
    const token = await getInvitationToken(invitee.email);

    await request(app)
      .delete(`/v1/organizations/${organizationId}/invitations/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const inviteeSession = await registerAndGetSession(app, invitee);
    const response = await request(app)
      .post(`/v1/invitations/${token}/accept`)
      .set('Authorization', `Bearer ${inviteeSession.accessToken}`);
    expect(response.status).toBe(409);
  });

  it('rejects acceptance of an expired invitation', async () => {
    const { accessToken, organizationId } = await registerAndGetSession(app, owner);
    const created = await createInvitation(accessToken, organizationId, invitee.email);
    const token = await getInvitationToken(invitee.email);

    await prisma.invitation.update({
      where: { id: created.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const inviteeSession = await registerAndGetSession(app, invitee);
    const response = await request(app)
      .post(`/v1/invitations/${token}/accept`)
      .set('Authorization', `Bearer ${inviteeSession.accessToken}`);
    expect(response.status).toBe(409);
  });

  it('returns 404 for invitation routes on an organization the caller does not belong to', async () => {
    const { organizationId } = await registerAndGetSession(app, owner);
    const outsiderSession = await registerAndGetSession(app, outsider);

    const response = await request(app)
      .get(`/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', `Bearer ${outsiderSession.accessToken}`);
    expect(response.status).toBe(404);
  });
});
