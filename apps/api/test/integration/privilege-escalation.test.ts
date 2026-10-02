import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { generateInvitationToken } from '../../src/shared/security/index.js';
import { registerAndGetSession } from '../helpers/auth.js';
import { resetDatabase } from '../helpers/db.js';
import { addMember } from '../helpers/members.js';

const app = buildApp();

const owner = { email: 'owner@example.com', password: 'correct-horse-battery', name: 'Owner' };
const admin = { email: 'admin@example.com', password: 'correct-horse-battery', name: 'Admin' };
const otherAdmin = { email: 'other-admin@example.com', password: 'correct-horse-battery', name: 'Other Admin' };
const member = { email: 'member@example.com', password: 'correct-horse-battery', name: 'Member' };
const invitee = { email: 'invitee@example.com', password: 'correct-horse-battery', name: 'Invitee' };

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const ownerSession = await registerAndGetSession(app, owner);
  const { organizationId } = ownerSession;
  const adminSession = await addMember(app, ownerSession.accessToken, organizationId, admin, 'ADMIN');
  const otherAdminSession = await addMember(app, ownerSession.accessToken, organizationId, otherAdmin, 'ADMIN');
  const memberSession = await addMember(app, ownerSession.accessToken, organizationId, member, 'MEMBER');
  return { ownerSession, adminSession, otherAdminSession, memberSession, organizationId };
}

function invite(accessToken: string, organizationId: string, email: string, role: string) {
  return request(app)
    .post(`/v1/organizations/${organizationId}/invitations`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ email, role });
}

describe('inviting with the OWNER role', () => {
  it('is refused with 409 for an ADMIN and for the OWNER, and creates no invitation', async () => {
    const { ownerSession, adminSession, organizationId } = await setup();

    for (const session of [adminSession, ownerSession]) {
      const response = await invite(session.accessToken, organizationId, invitee.email, 'OWNER');
      expect(response.status).toBe(409);
    }

    expect(await prisma.invitation.count({ where: { organizationId, role: 'OWNER' } })).toBe(0);
  });

  it('still lets an ADMIN invite up to their own role', async () => {
    const { adminSession, organizationId } = await setup();

    const response = await invite(adminSession.accessToken, organizationId, invitee.email, 'ADMIN');

    expect(response.status).toBe(201);
    expect(response.body.role).toBe('ADMIN');
  });

  it('refuses to accept an OWNER invitation that was created before the fix', async () => {
    const { ownerSession, organizationId } = await setup();
    const { token, tokenHash } = generateInvitationToken();
    await prisma.invitation.create({
      data: {
        organizationId,
        email: invitee.email,
        role: 'OWNER',
        tokenHash,
        invitedById: ownerSession.userId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const inviteeSession = await registerAndGetSession(app, invitee);

    const response = await request(app)
      .post(`/v1/invitations/${token}/accept`)
      .set('Authorization', `Bearer ${inviteeSession.accessToken}`);

    expect(response.status).toBe(409);
    expect(await prisma.membership.count({ where: { organizationId, role: 'OWNER' } })).toBe(1);
  });
});

describe('managing a member of an equal or higher role', () => {
  it('forbids an ADMIN from demoting or removing another ADMIN', async () => {
    const { adminSession, otherAdminSession, organizationId } = await setup();
    const auth = { Authorization: `Bearer ${adminSession.accessToken}` };
    const target = `/v1/organizations/${organizationId}/members/${otherAdminSession.userId}`;

    expect((await request(app).patch(target).set(auth).send({ role: 'VIEWER' })).status).toBe(403);
    expect((await request(app).delete(target).set(auth)).status).toBe(403);

    const stillThere = await prisma.membership.findFirst({
      where: { organizationId, userId: otherAdminSession.userId },
    });
    expect(stillThere?.role).toBe('ADMIN');
  });

  it('lets an ADMIN manage a MEMBER, and the OWNER manage an ADMIN', async () => {
    const { ownerSession, adminSession, otherAdminSession, memberSession, organizationId } = await setup();

    const demoteMember = await request(app)
      .patch(`/v1/organizations/${organizationId}/members/${memberSession.userId}`)
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .send({ role: 'VIEWER' });
    expect(demoteMember.status).toBe(200);

    const demoteAdmin = await request(app)
      .patch(`/v1/organizations/${organizationId}/members/${otherAdminSession.userId}`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ role: 'MEMBER' });
    expect(demoteAdmin.status).toBe(200);
  });
});
