import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { activityService } from '../../src/modules/activity/activity.service.js';
import { prisma } from '../../src/shared/db/index.js';
import { registerAndGetSession, type RegisteredSession } from '../helpers/auth.js';
import { resetDatabase } from '../helpers/db.js';
import { getInvitationToken } from '../helpers/invitations.js';

const app = buildApp();

const owner = { email: 'radia.perlman@example.com', password: 'correct-horse-battery', name: 'Radia Perlman' };
const admin = { email: 'shafi.goldwasser@example.com', password: 'correct-horse-battery', name: 'Shafi Goldwasser' };
const member = { email: 'frances.allen@example.com', password: 'correct-horse-battery', name: 'Frances Allen' };
const viewer = { email: 'barbara.liskov@example.com', password: 'correct-horse-battery', name: 'Barbara Liskov' };
const outsider = { email: 'karen.sparck-jones@example.com', password: 'correct-horse-battery', name: 'Karen Spärck Jones' };

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Invites `user` into `organizationId` with `role` and accepts on their behalf -- same pattern as the other integration suites. */
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

async function setupOrgWithAllRoles(): Promise<Setup> {
  const ownerSession = await registerAndGetSession(app, owner);
  const { organizationId } = ownerSession;

  const adminSession = await addMember(ownerSession.accessToken, organizationId, admin, 'ADMIN');
  const memberSession = await addMember(ownerSession.accessToken, organizationId, member, 'MEMBER');
  const viewerSession = await addMember(ownerSession.accessToken, organizationId, viewer, 'VIEWER');

  return { owner: ownerSession, admin: adminSession, member: memberSession, viewer: viewerSession, organizationId };
}

describe('outbox', () => {
  it('an event produced inside a rolled-back transaction never reaches the outbox', async () => {
    const { owner: ownerSession } = await setupOrgWithAllRoles();
    const { accessToken, organizationId } = ownerSession;

    const project = await request(app)
      .post(`/v1/organizations/${organizationId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ key: 'ENG', name: 'Engineering' });
    const task = await request(app)
      .post(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Ship it', priority: 'MEDIUM' });

    const outboxBefore = await prisma.outboxEvent.count();

    // Real 409, not a mock: consume the version once, then reuse it -- the
    // same technique test/integration/comments-labels-activity.test.ts uses
    // to prove the activity log never gets an entry for a rejected update.
    // updateWithVersion's UPDATE affects 0 rows, tasksService.update throws
    // before diffing any fields, and the whole `prisma.$transaction` (task
    // update + activity entry + outbox event) rolls back together.
    await request(app)
      .patch(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'IN_PROGRESS', version: task.body.version });
    const rejected = await request(app)
      .patch(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'DONE', version: task.body.version });
    expect(rejected.status).toBe(409);

    // TASK_CREATED + the one successful STATUS_CHANGED produced two outbox
    // rows; the rejected PATCH must not have added a third.
    const outboxAfter = await prisma.outboxEvent.count();
    expect(outboxAfter).toBe(outboxBefore + 1);
  });
});

describe('activity log actor', () => {
  it('records an API key actor distinctly from a user actor, without exposing the key', async () => {
    const { owner: ownerSession } = await setupOrgWithAllRoles();
    const { accessToken, organizationId } = ownerSession;

    const project = await request(app)
      .post(`/v1/organizations/${organizationId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ key: 'ENG', name: 'Engineering' });
    const task = await request(app)
      .post(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Ship it', priority: 'MEDIUM' });

    const apiKeyResponse = await request(app)
      .post(`/v1/organizations/${organizationId}/api-keys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'CI bot', scopes: ['task:read'] });

    // No HTTP route lets an API key become a TaskActivity actor today (see
    // shared/authorization/api-key-scopes.ts) -- this proves the model and
    // the response mapper support it end to end regardless, by calling the
    // service directly the way a future write-capable scope would.
    await prisma.$transaction(async (tx) => {
      await activityService.record(
        {
          taskId: task.body.id,
          organizationId,
          apiKeyActorId: apiKeyResponse.body.id as string,
          type: 'TITLE_CHANGED',
          before: 'Ship it',
          after: 'Ship it faster',
        },
        tx,
      );
    });

    const activityResponse = await request(app)
      .get(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks/${task.body.id}/activity`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(activityResponse.status).toBe(200);
    const entries = activityResponse.body.data as { type: string; actor: Record<string, unknown> }[];
    const apiKeyEntry = entries.find((entry) => entry.type === 'TITLE_CHANGED');
    expect(apiKeyEntry?.actor).toEqual({
      type: 'API_KEY',
      id: apiKeyResponse.body.id,
      name: 'CI bot',
      prefix: apiKeyResponse.body.prefix,
    });
    expect(JSON.stringify(apiKeyEntry)).not.toContain(apiKeyResponse.body.key as string);

    const createdEntry = entries.find((entry) => entry.type === 'TASK_CREATED');
    expect(createdEntry?.actor).toMatchObject({ type: 'USER', id: ownerSession.userId, email: owner.email });
  });
});

describe('api keys', () => {
  it('only ADMIN/OWNER can create one; the full key is returned once and never again', async () => {
    const { owner: ownerSession, member: memberSession, organizationId } = await setupOrgWithAllRoles();

    const forbidden = await request(app)
      .post(`/v1/organizations/${organizationId}/api-keys`)
      .set('Authorization', `Bearer ${memberSession.accessToken}`)
      .send({ name: 'Should fail', scopes: ['task:read'] });
    expect(forbidden.status).toBe(403);

    const created = await request(app)
      .post(`/v1/organizations/${organizationId}/api-keys`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ name: 'Read-only integration', scopes: ['task:read', 'project:read'] });
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^tp_live_/);
    expect(created.body.prefix).toBe((created.body.key as string).slice(0, created.body.prefix.length));

    const listResponse = await request(app)
      .get(`/v1/organizations/${organizationId}/api-keys`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body[0].key).toBeUndefined();
    expect(JSON.stringify(listResponse.body)).not.toContain(created.body.key as string);
  });

  it('rejects a scope outside the read-only vocabulary an API key is allowed to hold', async () => {
    const { owner: ownerSession, organizationId } = await setupOrgWithAllRoles();

    const response = await request(app)
      .post(`/v1/organizations/${organizationId}/api-keys`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ name: 'Too powerful', scopes: ['task:create'] });
    expect(response.status).toBe(422);
  });

  it('authenticates with a valid key, honors its scopes, and rejects revoked/expired/scopeless attempts', async () => {
    const { owner: ownerSession, organizationId } = await setupOrgWithAllRoles();

    const project = await request(app)
      .post(`/v1/organizations/${organizationId}/projects`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ key: 'ENG', name: 'Engineering' });
    await request(app)
      .post(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ title: 'Ship it', priority: 'MEDIUM' });

    const created = await request(app)
      .post(`/v1/organizations/${organizationId}/api-keys`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ name: 'Read-only integration', scopes: ['task:read'] });
    const key = created.body.key as string;

    // Lists tasks (has task:read)...
    const listTasks = await request(app)
      .get(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks`)
      .set('Authorization', `Bearer ${key}`);
    expect(listTasks.status).toBe(200);
    expect(listTasks.body.data).toHaveLength(1);

    // ...but can't create one (no task:create scope, ever grantable).
    const createTask = await request(app)
      .post(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks`)
      .set('Authorization', `Bearer ${key}`)
      .send({ title: 'Should not be allowed', priority: 'LOW' });
    expect(createTask.status).toBe(403);

    // Revoked: an immediate 401 on the next request.
    await request(app)
      .delete(`/v1/organizations/${organizationId}/api-keys/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`);
    const afterRevoke = await request(app)
      .get(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks`)
      .set('Authorization', `Bearer ${key}`);
    expect(afterRevoke.status).toBe(401);

    // A brand-new key with an expiresAt in the past is rejected too.
    const expiredCreate = await request(app)
      .post(`/v1/organizations/${organizationId}/api-keys`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ name: 'Already expired', scopes: ['task:read'], expiresAt: new Date(Date.now() - 1000).toISOString() });
    const expiredKey = expiredCreate.body.key as string;
    const withExpiredKey = await request(app)
      .get(`/v1/organizations/${organizationId}/projects/${project.body.id}/tasks`)
      .set('Authorization', `Bearer ${expiredKey}`);
    expect(withExpiredKey.status).toBe(401);
  });

  it("an API key is scoped to its own organization -- it can't reach another one, even with a valid key", async () => {
    const { owner: ownerSession, organizationId } = await setupOrgWithAllRoles();
    const otherOwnerSession = await registerAndGetSession(app, { email: 'shirley.jackson@example.com', password: 'correct-horse-battery', name: 'Shirley Jackson' });

    const created = await request(app)
      .post(`/v1/organizations/${organizationId}/api-keys`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ name: 'Scoped key', scopes: ['project:read'] });

    const response = await request(app)
      .get(`/v1/organizations/${otherOwnerSession.organizationId}/projects`)
      .set('Authorization', `Bearer ${created.body.key}`);
    expect(response.status).toBe(404);
  });
});

describe('webhooks', () => {
  it('only ADMIN/OWNER can manage webhooks; the secret is returned on create and rotate, never on list or get', async () => {
    const { owner: ownerSession, member: memberSession, organizationId } = await setupOrgWithAllRoles();

    const forbidden = await request(app)
      .post(`/v1/organizations/${organizationId}/webhooks`)
      .set('Authorization', `Bearer ${memberSession.accessToken}`)
      .send({ url: 'https://example.com/hooks', eventTypes: ['TASK_CREATED'] });
    expect(forbidden.status).toBe(403);

    const created = await request(app)
      .post(`/v1/organizations/${organizationId}/webhooks`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ url: 'https://example.com/hooks', eventTypes: ['TASK_CREATED', 'STATUS_CHANGED'] });
    expect(created.status).toBe(201);
    expect(created.body.secret).toMatch(/^whsec_/);

    const listResponse = await request(app)
      .get(`/v1/organizations/${organizationId}/webhooks`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`);
    expect(listResponse.body[0].secret).toBeUndefined();
    expect(JSON.stringify(listResponse.body)).not.toContain(created.body.secret as string);

    const rotated = await request(app)
      .post(`/v1/organizations/${organizationId}/webhooks/${created.body.id}/rotate-secret`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`);
    expect(rotated.status).toBe(200);
    expect(rotated.body.secret).toMatch(/^whsec_/);
    expect(rotated.body.secret).not.toBe(created.body.secret);

    const listAfterRotate = await request(app)
      .get(`/v1/organizations/${organizationId}/webhooks`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`);
    expect(JSON.stringify(listAfterRotate.body)).not.toContain(rotated.body.secret as string);
  });

  it('the test-send endpoint queues a real delivery job through the same pipeline as a real event', async () => {
    const { owner: ownerSession, organizationId } = await setupOrgWithAllRoles();

    const created = await request(app)
      .post(`/v1/organizations/${organizationId}/webhooks`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ url: 'https://example.com/hooks', eventTypes: ['TASK_CREATED'] });

    const testResponse = await request(app)
      .post(`/v1/organizations/${organizationId}/webhooks/${created.body.id}/test`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`);
    expect(testResponse.status).toBe(202);

    const testEvent = await prisma.outboxEvent.findFirst({ where: { organizationId, type: 'WEBHOOK_TEST' } });
    expect(testEvent).not.toBeNull();
    expect(testEvent?.dispatchedAt).not.toBeNull();
  });

  it('returns 404, not 403, for webhook and API key routes when the caller is not a member', async () => {
    const { organizationId } = await setupOrgWithAllRoles();
    const outsiderSession = await registerAndGetSession(app, outsider);

    const webhooksList = await request(app)
      .get(`/v1/organizations/${organizationId}/webhooks`)
      .set('Authorization', `Bearer ${outsiderSession.accessToken}`);
    expect(webhooksList.status).toBe(404);

    const apiKeysList = await request(app)
      .get(`/v1/organizations/${organizationId}/api-keys`)
      .set('Authorization', `Bearer ${outsiderSession.accessToken}`);
    expect(apiKeysList.status).toBe(404);
  });
});
