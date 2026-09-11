import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { apiKeysService } from '../../src/modules/api-keys/api-keys.service.js';
import {
  API_KEY_ALLOWED_PERMISSIONS,
  API_KEY_WRITE_SCOPES,
  roleHasPermission,
} from '../../src/shared/authorization/index.js';
import { prisma } from '../../src/shared/db/index.js';
import { ForbiddenError } from '../../src/shared/errors/index.js';
import { registerAndGetSession, type RegisteredSession } from '../helpers/auth.js';
import { resetDatabase } from '../helpers/db.js';
import { addMember } from '../helpers/members.js';

const app = buildApp();

const owner = { email: 'joan.clarke@example.com', password: 'correct-horse-battery', name: 'Joan Clarke' };
const admin = { email: 'mary.keller@example.com', password: 'correct-horse-battery', name: 'Mary Keller' };
const member = { email: 'evelyn.granville@example.com', password: 'correct-horse-battery', name: 'Evelyn Granville' };

interface Setup {
  owner: RegisteredSession;
  admin: RegisteredSession;
  member: RegisteredSession;
  organizationId: string;
  projectId: string;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup(): Promise<Setup> {
  const ownerSession = await registerAndGetSession(app, owner);
  const { organizationId } = ownerSession;
  const adminSession = await addMember(app, ownerSession.accessToken, organizationId, admin, 'ADMIN');
  const memberSession = await addMember(app, ownerSession.accessToken, organizationId, member, 'MEMBER');

  const project = await request(app)
    .post(`/v1/organizations/${organizationId}/projects`)
    .set('Authorization', `Bearer ${ownerSession.accessToken}`)
    .send({ key: 'OPS', name: 'Operations' });

  return { owner: ownerSession, admin: adminSession, member: memberSession, organizationId, projectId: project.body.id as string };
}

function createKey(accessToken: string, organizationId: string, scopes: readonly string[], name = 'Automation') {
  return request(app)
    .post(`/v1/organizations/${organizationId}/api-keys`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, scopes });
}

describe('an API key with write scopes', () => {
  it('creates a task in its own name, and the activity log records the key -- not the person who created it', async () => {
    const s = await setup();
    // Created by the ADMIN, so "attributed to the key's creator" would be a
    // distinguishable, wrong answer.
    const created = await createKey(s.admin.accessToken, s.organizationId, ['task:create', 'task:read'], 'CI bot');
    expect(created.status).toBe(201);
    const keyId = created.body.id as string;

    const task = await request(app)
      .post(`/v1/organizations/${s.organizationId}/projects/${s.projectId}/tasks`)
      .set('Authorization', `Bearer ${created.body.key}`)
      .send({ title: 'Nightly deploy' });
    expect(task.status).toBe(201);
    expect(task.body.createdById).toBeNull();
    expect(task.body.createdByApiKeyId).toBe(keyId);

    const activity = await request(app)
      .get(`/v1/organizations/${s.organizationId}/projects/${s.projectId}/tasks/${task.body.id}/activity`)
      .set('Authorization', `Bearer ${s.owner.accessToken}`);
    const entries = activity.body.data as { type: string; actor: Record<string, unknown> }[];
    const createdEntry = entries.find((entry) => entry.type === 'TASK_CREATED');
    expect(createdEntry?.actor).toEqual({ type: 'API_KEY', id: keyId, name: 'CI bot', prefix: created.body.prefix });
    expect(JSON.stringify(entries)).not.toContain(s.admin.userId);
    expect(JSON.stringify(entries)).not.toContain(created.body.key as string);

    // The webhook-facing copy of the same event agrees.
    const outbox = await prisma.outboxEvent.findFirst({ where: { organizationId: s.organizationId, type: 'TASK_CREATED' } });
    expect((outbox?.payload as { actor: unknown }).actor).toEqual({ type: 'API_KEY', id: keyId });
  });

  it('covers the whole write catalog: projects, tasks, assignment, labels and comments', async () => {
    const s = await setup();
    const created = await createKey(s.owner.accessToken, s.organizationId, [...API_KEY_WRITE_SCOPES, 'task:read', 'project:read']);
    const keyId = created.body.id as string;
    const auth = { Authorization: `Bearer ${created.body.key}` };
    const base = `/v1/organizations/${s.organizationId}`;

    const project = await request(app).post(`${base}/projects`).set(auth).send({ key: 'BOT', name: 'Automation' });
    expect(project.status).toBe(201);
    expect(project.body).toMatchObject({ createdById: null, createdByApiKeyId: keyId });
    expect((await request(app).patch(`${base}/projects/${project.body.id}`).set(auth).send({ name: 'Automation v2' })).status).toBe(200);

    const label = await request(app).post(`${base}/labels`).set(auth).send({ name: 'automated', color: '#1f6feb' });
    expect(label.status).toBe(201);
    expect((await request(app).patch(`${base}/labels/${label.body.id}`).set(auth).send({ name: 'bot' })).status).toBe(200);

    const tasksPath = `${base}/projects/${project.body.id}/tasks`;
    const task = await request(app).post(tasksPath).set(auth).send({ title: 'Rotate certificates' });
    expect(task.status).toBe(201);

    const updated = await request(app)
      .patch(`${tasksPath}/${task.body.id}`)
      .set(auth)
      .send({ status: 'IN_PROGRESS', version: task.body.version });
    expect(updated.status).toBe(200);

    const assigned = await request(app).post(`${tasksPath}/${task.body.id}/assign`).set(auth).send({ userId: s.member.userId });
    expect(assigned.status).toBe(200);

    const labelled = await request(app).put(`${tasksPath}/${task.body.id}/labels`).set(auth).send({ labelIds: [label.body.id] });
    expect(labelled.status).toBe(200);

    const comment = await request(app).post(`${tasksPath}/${task.body.id}/comments`).set(auth).send({ body: 'Certificates rotated.' });
    expect(comment.status).toBe(201);
    expect(comment.body).toMatchObject({
      authorId: null,
      author: null,
      authorApiKeyId: keyId,
      authorApiKey: { id: keyId, name: 'Automation', prefix: created.body.prefix },
    });

    expect((await request(app).post(`${base}/projects/${project.body.id}/archive`).set(auth)).status).toBe(200);

    const activity = await request(app).get(`${tasksPath}/${task.body.id}/activity`).set(auth);
    const actors = (activity.body.data as { actor: { type: string; id: string } }[]).map((entry) => entry.actor);
    expect(actors.length).toBeGreaterThanOrEqual(5);
    expect(actors.every((actor) => actor.type === 'API_KEY' && actor.id === keyId)).toBe(true);

    // Nobody can edit a comment a key wrote -- there is no "any" edit, and the key isn't a user.
    const ownerEdit = await request(app)
      .patch(`${tasksPath}/${task.body.id}/comments/${comment.body.id}`)
      .set('Authorization', `Bearer ${s.owner.accessToken}`)
      .send({ body: 'Rewritten' });
    expect(ownerEdit.status).toBe(403);
  });

  it('gets 403 for every write it holds no scope for', async () => {
    const s = await setup();
    const base = `/v1/organizations/${s.organizationId}`;
    const tasksPath = `${base}/projects/${s.projectId}/tasks`;
    const humanTask = await request(app)
      .post(tasksPath)
      .set('Authorization', `Bearer ${s.owner.accessToken}`)
      .send({ title: 'Written by a person' });

    const readOnly = await createKey(s.owner.accessToken, s.organizationId, ['task:read', 'project:read']);
    const auth = { Authorization: `Bearer ${readOnly.body.key}` };

    expect((await request(app).get(tasksPath).set(auth)).status).toBe(200);

    const attempts = await Promise.all([
      request(app).post(tasksPath).set(auth).send({ title: 'Nope' }),
      request(app).patch(`${tasksPath}/${humanTask.body.id}`).set(auth).send({ title: 'Nope', version: humanTask.body.version }),
      request(app).post(`${tasksPath}/${humanTask.body.id}/assign`).set(auth).send({ userId: s.member.userId }),
      request(app).post(`${tasksPath}/${humanTask.body.id}/comments`).set(auth).send({ body: 'Nope' }),
      request(app).post(`${base}/projects`).set(auth).send({ key: 'NOPE', name: 'Nope' }),
      request(app).post(`${base}/labels`).set(auth).send({ name: 'nope', color: '#1f6feb' }),
    ]);
    expect(attempts.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
  });

  it('never owns anything: creating a task grants no right to modify or delete it', async () => {
    const s = await setup();
    const created = await createKey(s.owner.accessToken, s.organizationId, ['task:create', 'task:read']);
    const auth = { Authorization: `Bearer ${created.body.key}` };
    const tasksPath = `/v1/organizations/${s.organizationId}/projects/${s.projectId}/tasks`;

    const task = await request(app).post(tasksPath).set(auth).send({ title: 'Mine?' });
    expect(task.status).toBe(201);

    const update = await request(app).patch(`${tasksPath}/${task.body.id}`).set(auth).send({ title: 'Still mine?', version: task.body.version });
    const remove = await request(app).delete(`${tasksPath}/${task.body.id}`).set(auth);
    expect(update.status).toBe(403);
    expect(remove.status).toBe(403);
  });

  it('can never be granted a deletion scope, even by the OWNER who holds it', async () => {
    const s = await setup();
    for (const scope of ['task:delete:any', 'project:delete', 'comment:delete:any']) {
      const response = await createKey(s.owner.accessToken, s.organizationId, [scope]);
      expect(response.status).toBe(422);
    }
  });
});

describe('privilege escalation through key creation', () => {
  it('an ADMIN cannot create a key carrying a scope they do not hold themselves', async () => {
    const s = await setup();

    const escalation = await createKey(s.admin.accessToken, s.organizationId, ['task:read', 'organization:delete']);
    expect(escalation.status).toBe(403);
    expect(escalation.body.detail).toContain('organization:delete');
    expect(escalation.body.key).toBeUndefined();

    const transfer = await createKey(s.admin.accessToken, s.organizationId, ['ownership:transfer']);
    expect(transfer.status).toBe(403);

    expect(await prisma.apiKey.count({ where: { organizationId: s.organizationId } })).toBe(0);

    // The OWNER does hold organization:delete, so the same request fails for
    // a different reason: it's simply never grantable to a key.
    const fromOwner = await createKey(s.owner.accessToken, s.organizationId, ['organization:delete']);
    expect(fromOwner.status).toBe(422);
  });

  it('the guard follows the matrix for every role and every grantable scope, independently of the route', async () => {
    const s = await setup();
    // HTTP alone can't prove this guard exists: the route already stops
    // MEMBER and VIEWER (apikey:manage), and today ADMIN holds the whole
    // catalog. So walk the service directly -- if the possession check were
    // removed, the refusals below would start resolving. The creator id is
    // a real user only to satisfy the FK; the role is what's under test.
    let refusals = 0;
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const) {
      for (const scope of API_KEY_ALLOWED_PERMISSIONS) {
        const attempt = apiKeysService.create(
          s.organizationId,
          { type: 'user', userId: s.owner.userId, role },
          `${role} ${scope}`,
          [scope],
        );
        if (roleHasPermission(role, scope)) {
          await expect(attempt).resolves.toMatchObject({ key: expect.any(String) });
        } else {
          await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
          refusals += 1;
        }
      }
    }
    expect(refusals).toBeGreaterThan(0);
  });
});
