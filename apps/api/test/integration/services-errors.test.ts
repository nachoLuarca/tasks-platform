import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { registerAndGetSession, type RegisteredSession } from '../helpers/auth.js';
import { resetDatabase } from '../helpers/db.js';
import { getInvitationToken } from '../helpers/invitations.js';
import { addMember } from '../helpers/members.js';

const app = buildApp();

const pw = 'correct-horse-battery';
const owner = { email: 'alan.turing@example.com', password: pw, name: 'Alan Turing' };
const admin = { email: 'margaret.hamilton@example.com', password: pw, name: 'Margaret Hamilton' };
const member = { email: 'linus.torvalds@example.com', password: pw, name: 'Linus Torvalds' };
const member2 = { email: 'ken.thompson@example.com', password: pw, name: 'Ken Thompson' };
const viewer = { email: 'dennis.ritchie@example.com', password: pw, name: 'Dennis Ritchie' };
const outsider = { email: 'tim.berners-lee@example.com', password: pw, name: 'Tim Berners-Lee' };

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface Setup {
  owner: RegisteredSession;
  admin: RegisteredSession;
  member: RegisteredSession;
  member2: RegisteredSession;
  viewer: RegisteredSession;
  organizationId: string;
  org: string;
}

async function setup(): Promise<Setup> {
  const o = await registerAndGetSession(app, owner);
  const id = o.organizationId;
  const a = await addMember(app, o.accessToken, id, admin, 'ADMIN');
  const m = await addMember(app, o.accessToken, id, member, 'MEMBER');
  const m2 = await addMember(app, o.accessToken, id, member2, 'MEMBER');
  const v = await addMember(app, o.accessToken, id, viewer, 'VIEWER');
  return { owner: o, admin: a, member: m, member2: m2, viewer: v, organizationId: id, org: `/v1/organizations/${id}` };
}

const auth = (s: RegisteredSession) => ({ Authorization: `Bearer ${s.accessToken}` });

describe('members service errors', () => {
  it('404 when the target is not a member (update role, remove, transfer)', async () => {
    const s = await setup();
    const ghost = randomUUID();
    const patch = await request(app).patch(`${s.org}/members/${ghost}`).set(auth(s.owner)).send({ role: 'ADMIN' });
    expect(patch.status).toBe(404);
    const del = await request(app).delete(`${s.org}/members/${ghost}`).set(auth(s.owner));
    expect(del.status).toBe(404);
    const transfer = await request(app).post(`${s.org}/transfer-ownership`).set(auth(s.owner)).send({ userId: ghost });
    expect(transfer.status).toBe(404);
  });

  it('409 when promoting someone to OWNER through the role endpoint', async () => {
    const s = await setup();
    const response = await request(app)
      .patch(`${s.org}/members/${s.member.userId}`)
      .set(auth(s.owner))
      .send({ role: 'OWNER' });
    expect(response.status).toBe(409);
    const row = await prisma.membership.findFirst({ where: { userId: s.member.userId, organizationId: s.organizationId } });
    expect(row?.role).toBe('MEMBER');
  });

  it('409 when transferring ownership to the current owner', async () => {
    const s = await setup();
    const response = await request(app).post(`${s.org}/transfer-ownership`).set(auth(s.owner)).send({ userId: s.owner.userId });
    expect(response.status).toBe(409);
  });

  it('400 on an invalid role or a malformed transfer target', async () => {
    const s = await setup();
    const role = await request(app).patch(`${s.org}/members/${s.member.userId}`).set(auth(s.owner)).send({ role: 'GOD' });
    expect(role.status).toBe(400);
    const transfer = await request(app).post(`${s.org}/transfer-ownership`).set(auth(s.owner)).send({ userId: 'nope' });
    expect(transfer.status).toBe(400);
  });

  it('a MEMBER or ADMIN cannot transfer ownership, and a MEMBER cannot change roles or remove people', async () => {
    const s = await setup();
    for (const session of [s.admin, s.member]) {
      const transfer = await request(app).post(`${s.org}/transfer-ownership`).set(auth(session)).send({ userId: s.member2.userId });
      expect(transfer.status).toBe(403);
    }
    const role = await request(app).patch(`${s.org}/members/${s.member2.userId}`).set(auth(s.member)).send({ role: 'VIEWER' });
    expect(role.status).toBe(403);
    const remove = await request(app).delete(`${s.org}/members/${s.member2.userId}`).set(auth(s.member));
    expect(remove.status).toBe(403);
  });

  it('a non-member cannot leave an organization they do not belong to', async () => {
    const s = await setup();
    const other = await registerAndGetSession(app, outsider);
    const response = await request(app).delete(`${s.org}/members/me`).set(auth(other));
    expect(response.status).toBe(404);
  });
});

describe('organizations service errors', () => {
  it('404 for a nonexistent organization, and for one that was soft-deleted', async () => {
    const s = await setup();
    const missing = await request(app).get(`/v1/organizations/${randomUUID()}`).set(auth(s.owner));
    expect(missing.status).toBe(404);

    const del = await request(app).delete(s.org).set(auth(s.owner));
    expect(del.status).toBe(204);
    const afterDelete = await request(app).get(s.org).set(auth(s.owner));
    expect(afterDelete.status).toBe(404);
  });

  it('400 on empty or missing organization names', async () => {
    const s = await setup();
    const create = await request(app).post('/v1/organizations').set(auth(s.owner)).send({ name: '   ' });
    expect(create.status).toBe(400);
    const update = await request(app).patch(s.org).set(auth(s.owner)).send({});
    expect(update.status).toBe(400);
  });

  it('falls back to a generic slug for names with no latin characters', async () => {
    const s = await setup();
    const first = await request(app).post('/v1/organizations').set(auth(s.owner)).send({ name: '!!!' });
    const second = await request(app).post('/v1/organizations').set(auth(s.owner)).send({ name: '???' });
    expect(first.status).toBe(201);
    expect(first.body.slug).toBe('org');
    expect(second.body.slug).toBe('org-2');
  });
});

describe('invitations service errors', () => {
  async function invite(s: Setup, email: string, role = 'MEMBER') {
    return request(app).post(`${s.org}/invitations`).set(auth(s.owner)).send({ email, role });
  }

  it('409 when inviting an existing member or an email with a pending invitation', async () => {
    const s = await setup();
    const existing = await invite(s, member.email);
    expect(existing.status).toBe(409);

    const first = await invite(s, outsider.email);
    expect(first.status).toBe(201);
    const duplicate = await invite(s, outsider.email);
    expect(duplicate.status).toBe(409);
  });

  it('400 for an invalid email or role, 403 for a MEMBER/VIEWER inviter', async () => {
    const s = await setup();
    expect((await invite(s, 'not-an-email')).status).toBe(400);
    expect((await invite(s, 'x@example.com', 'EMPEROR')).status).toBe(400);
    for (const session of [s.member, s.viewer]) {
      const response = await request(app).post(`${s.org}/invitations`).set(auth(session)).send({ email: 'y@example.com', role: 'MEMBER' });
      expect(response.status).toBe(403);
    }
  });

  it('revoke: 404 for unknown or already revoked, 403 for a MEMBER', async () => {
    const s = await setup();
    const created = await invite(s, outsider.email);
    const id = created.body.id as string;

    expect((await request(app).delete(`${s.org}/invitations/${id}`).set(auth(s.member))).status).toBe(403);
    expect((await request(app).delete(`${s.org}/invitations/${randomUUID()}`).set(auth(s.owner))).status).toBe(404);
    expect((await request(app).delete(`${s.org}/invitations/${id}`).set(auth(s.owner))).status).toBe(204);
    expect((await request(app).delete(`${s.org}/invitations/${id}`).set(auth(s.owner))).status).toBe(404);
  });

  it('preview and accept: unknown token is 404; revoked, accepted, expired are 409; wrong email is 403', async () => {
    const s = await setup();
    const other = await registerAndGetSession(app, outsider);

    expect((await request(app).get('/v1/invitations/unknown-token')).status).toBe(404);
    expect((await request(app).post('/v1/invitations/unknown-token/accept').set(auth(other))).status).toBe(404);
    expect((await request(app).post('/v1/invitations/unknown-token/accept')).status).toBe(401);

    // wrong email
    await invite(s, 'someone.else@example.com');
    const wrongToken = await getInvitationToken('someone.else@example.com');
    expect((await request(app).post(`/v1/invitations/${wrongToken}/accept`).set(auth(other))).status).toBe(403);

    // revoked
    const revoked = await invite(s, outsider.email);
    const revokedToken = await getInvitationToken(outsider.email);
    await request(app).delete(`${s.org}/invitations/${revoked.body.id}`).set(auth(s.owner));
    expect((await request(app).get(`/v1/invitations/${revokedToken}`)).status).toBe(404);
    expect((await request(app).post(`/v1/invitations/${revokedToken}/accept`).set(auth(other))).status).toBe(409);

    // expired
    const expired = await invite(s, outsider.email);
    const expiredToken = await getInvitationToken(outsider.email);
    await prisma.invitation.update({ where: { id: expired.body.id as string }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get(`/v1/invitations/${expiredToken}`)).status).toBe(404);
    expect((await request(app).post(`/v1/invitations/${expiredToken}/accept`).set(auth(other))).status).toBe(409);

    // accepted twice (re-inviting over the expired invitation replaces it)
    expect((await invite(s, outsider.email, 'VIEWER')).status).toBe(201);
    const token = await getInvitationToken(outsider.email);
    expect((await request(app).post(`/v1/invitations/${token}/accept`).set(auth(other))).status).toBe(204);
    expect((await request(app).post(`/v1/invitations/${token}/accept`).set(auth(other))).status).toBe(409);
  });

  it('accept is 409 when the user already became a member another way', async () => {
    const s = await setup();
    const other = await registerAndGetSession(app, outsider);
    await invite(s, outsider.email);
    const token = await getInvitationToken(outsider.email);
    await prisma.membership.create({ data: { userId: other.userId, organizationId: s.organizationId, role: 'VIEWER' } });
    const response = await request(app).post(`/v1/invitations/${token}/accept`).set(auth(other));
    expect(response.status).toBe(409);
  });
});

describe('labels service errors', () => {
  it('409 on duplicate names (case-insensitive) at create and rename; 403 for non-managers; 404 unknown; 400 invalid', async () => {
    const s = await setup();
    const labels = `${s.org}/labels`;
    const bug = await request(app).post(labels).set(auth(s.admin)).send({ name: 'Bug', color: '#FF0000' });
    expect(bug.status).toBe(201);
    const other = await request(app).post(labels).set(auth(s.admin)).send({ name: 'Feature', color: '#00FF00' });

    expect((await request(app).post(labels).set(auth(s.admin)).send({ name: 'bUg', color: '#000000' })).status).toBe(409);
    expect((await request(app).patch(`${labels}/${other.body.id}`).set(auth(s.admin)).send({ name: 'BUG' })).status).toBe(409);
    // renaming to a different casing of its own name is fine
    expect((await request(app).patch(`${labels}/${bug.body.id}`).set(auth(s.admin)).send({ name: 'BUG' })).status).toBe(200);

    expect((await request(app).post(labels).set(auth(s.member)).send({ name: 'X', color: '#000000' })).status).toBe(403);
    expect((await request(app).patch(`${labels}/${bug.body.id}`).set(auth(s.member)).send({ name: 'Z' })).status).toBe(403);
    expect((await request(app).delete(`${labels}/${bug.body.id}`).set(auth(s.viewer))).status).toBe(403);

    expect((await request(app).patch(`${labels}/${randomUUID()}`).set(auth(s.admin)).send({ name: 'Z' })).status).toBe(404);
    expect((await request(app).delete(`${labels}/${randomUUID()}`).set(auth(s.admin))).status).toBe(404);

    expect((await request(app).post(labels).set(auth(s.admin)).send({ name: 'Bad', color: 'red' })).status).toBe(400);
    expect((await request(app).post(labels).set(auth(s.admin)).send({ name: '', color: '#000000' })).status).toBe(400);
  });

  it('deleting a label detaches it from tasks but keeps the tasks', async () => {
    const s = await setup();
    const label = await request(app).post(`${s.org}/labels`).set(auth(s.admin)).send({ name: 'Bug', color: '#FF0000' });
    const project = await request(app).post(`${s.org}/projects`).set(auth(s.admin)).send({ key: 'ENG', name: 'Eng' });
    const task = await request(app).post(`${s.org}/projects/${project.body.id}/tasks`).set(auth(s.member)).send({ title: 'T', priority: 'LOW' });
    const taskUrl = `${s.org}/projects/${project.body.id}/tasks/${task.body.id}`;
    expect((await request(app).put(`${taskUrl}/labels`).set(auth(s.member)).send({ labelIds: [label.body.id] })).status).toBe(200);

    expect((await request(app).delete(`${s.org}/labels/${label.body.id}`).set(auth(s.admin))).status).toBe(204);
    const after = await request(app).get(taskUrl).set(auth(s.member));
    expect(after.status).toBe(200);
    expect(after.body.labels).toEqual([]);
  });
});

describe('projects service errors', () => {
  it('409 on duplicate key, double archive and double unarchive', async () => {
    const s = await setup();
    const projects = `${s.org}/projects`;
    const created = await request(app).post(projects).set(auth(s.admin)).send({ key: 'ENG', name: 'Eng' });
    expect(created.status).toBe(201);
    expect((await request(app).post(projects).set(auth(s.admin)).send({ key: 'ENG', name: 'Dup' })).status).toBe(409);

    const id = created.body.id as string;
    expect((await request(app).post(`${projects}/${id}/unarchive`).set(auth(s.admin))).status).toBe(409);
    expect((await request(app).post(`${projects}/${id}/archive`).set(auth(s.admin))).status).toBe(200);
    expect((await request(app).post(`${projects}/${id}/archive`).set(auth(s.admin))).status).toBe(409);
    expect((await request(app).post(`${projects}/${id}/unarchive`).set(auth(s.admin))).status).toBe(200);
  });

  it('403 for insufficient roles, 404 for unknown/foreign projects, 400 for invalid data', async () => {
    const s = await setup();
    const projects = `${s.org}/projects`;
    const created = await request(app).post(projects).set(auth(s.admin)).send({ key: 'OPS', name: 'Ops' });
    const id = created.body.id as string;

    expect((await request(app).post(projects).set(auth(s.viewer)).send({ key: 'VW', name: 'V' })).status).toBe(403);
    expect((await request(app).patch(`${projects}/${id}`).set(auth(s.viewer)).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).delete(`${projects}/${id}`).set(auth(s.member))).status).toBe(403);
    expect((await request(app).post(`${projects}/${id}/archive`).set(auth(s.viewer))).status).toBe(403);
    expect((await request(app).get(`${projects}/${id}`).set(auth(s.viewer))).status).toBe(200);

    expect((await request(app).get(`${projects}/${randomUUID()}`).set(auth(s.owner))).status).toBe(404);
    expect((await request(app).patch(`${projects}/${randomUUID()}`).set(auth(s.owner)).send({ name: 'x' })).status).toBe(404);
    expect((await request(app).delete(`${projects}/not-a-uuid`).set(auth(s.owner))).status).toBe(404);

    const other = await registerAndGetSession(app, outsider);
    expect((await request(app).get(`/v1/organizations/${other.organizationId}/projects/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).get(`${projects}/${id}`).set(auth(other))).status).toBe(404);

    expect((await request(app).post(projects).set(auth(s.admin)).send({ key: 'lower', name: 'x' })).status).toBe(400);
    expect((await request(app).post(projects).set(auth(s.admin)).send({ key: 'ABC', name: '' })).status).toBe(400);
    expect((await request(app).patch(`${projects}/${id}`).set(auth(s.admin)).send({})).status).toBe(400);
    expect((await request(app).get(`${projects}?status=WRONG`).set(auth(s.admin))).status).toBe(400);
  });
});

describe('tasks service errors', () => {
  async function withTask(s: Setup) {
    const project = await request(app).post(`${s.org}/projects`).set(auth(s.admin)).send({ key: 'ENG', name: 'Eng' });
    const base = `${s.org}/projects/${project.body.id}/tasks`;
    const task = await request(app).post(base).set(auth(s.member)).send({ title: 'Mine', priority: 'MEDIUM' });
    return { base, taskId: task.body.id as string, projectId: project.body.id as string, version: task.body.version as number };
  }

  it('403 for a VIEWER on every write; a MEMBER cannot touch or delete tasks they neither created nor are assigned to', async () => {
    const s = await setup();
    const { base, taskId, version } = await withTask(s);

    expect((await request(app).post(base).set(auth(s.viewer)).send({ title: 'x', priority: 'LOW' })).status).toBe(403);
    expect((await request(app).patch(`${base}/${taskId}`).set(auth(s.viewer)).send({ version, title: 'x' })).status).toBe(403);
    expect((await request(app).delete(`${base}/${taskId}`).set(auth(s.viewer))).status).toBe(403);
    expect((await request(app).put(`${base}/${taskId}/labels`).set(auth(s.viewer)).send({ labelIds: [] })).status).toBe(403);

    expect((await request(app).patch(`${base}/${taskId}`).set(auth(s.member2)).send({ version, title: 'x' })).status).toBe(403);
    expect((await request(app).delete(`${base}/${taskId}`).set(auth(s.member2))).status).toBe(403);
    expect((await request(app).put(`${base}/${taskId}/labels`).set(auth(s.member2)).send({ labelIds: [] })).status).toBe(403);

    // viewers can still read
    expect((await request(app).get(`${base}/${taskId}`).set(auth(s.viewer))).status).toBe(200);
  });

  it('404 for unknown tasks and projects, 409 on a stale version, 400 on invalid data', async () => {
    const s = await setup();
    const { base, taskId, version, projectId } = await withTask(s);

    expect((await request(app).get(`${base}/${randomUUID()}`).set(auth(s.owner))).status).toBe(404);
    expect((await request(app).patch(`${base}/${randomUUID()}`).set(auth(s.owner)).send({ version, title: 'x' })).status).toBe(404);
    expect((await request(app).get(`${s.org}/projects/${randomUUID()}/tasks`).set(auth(s.owner))).status).toBe(404);

    expect((await request(app).patch(`${base}/${taskId}`).set(auth(s.owner)).send({ version, title: 'ok' })).status).toBe(200);
    expect((await request(app).patch(`${base}/${taskId}`).set(auth(s.owner)).send({ version, title: 'stale' })).status).toBe(409);

    expect((await request(app).patch(`${base}/${taskId}`).set(auth(s.owner)).send({ version: 2 })).status).toBe(400);
    expect((await request(app).patch(`${base}/${taskId}`).set(auth(s.owner)).send({ title: 'no version' })).status).toBe(400);
    expect((await request(app).post(base).set(auth(s.owner)).send({ title: '', priority: 'LOW' })).status).toBe(400);
    expect((await request(app).post(base).set(auth(s.owner)).send({ title: 'x', priority: 'URGENT!!' })).status).toBe(400);
    expect((await request(app).get(`${base}?status=NOPE`).set(auth(s.owner))).status).toBe(400);

    // a task is not reachable through a different project
    const other = await request(app).post(`${s.org}/projects`).set(auth(s.admin)).send({ key: 'OPS', name: 'Ops' });
    expect(other.body.id).not.toBe(projectId);
    expect((await request(app).get(`${s.org}/projects/${other.body.id}/tasks/${taskId}`).set(auth(s.owner))).status).toBe(404);
  });

  it('assign: 422 for a non-member assignee, 403 for a MEMBER assigning others, 409 claiming an assigned task', async () => {
    const s = await setup();
    const { base, taskId } = await withTask(s);
    const stranger = await registerAndGetSession(app, outsider);

    expect((await request(app).post(`${base}/${taskId}/assign`).set(auth(s.admin)).send({ userId: stranger.userId })).status).toBe(422);
    expect((await request(app).post(`${base}/${taskId}/assign`).set(auth(s.member)).send({ userId: s.member2.userId })).status).toBe(403);
    expect((await request(app).post(`${base}/${taskId}/assign`).set(auth(s.viewer)).send({ userId: s.viewer.userId })).status).toBe(403);
    expect((await request(app).post(`${base}/${taskId}/assign`).set(auth(s.admin)).send({ userId: 'nope' })).status).toBe(400);

    expect((await request(app).post(`${base}/${taskId}/assign`).set(auth(s.admin)).send({ userId: s.member2.userId })).status).toBe(200);
    expect((await request(app).post(`${base}/${taskId}/assign`).set(auth(s.member)).send({ userId: s.member.userId })).status).toBe(409);
  });

  it('unassign: a MEMBER can only drop their own assignment; a VIEWER cannot unassign', async () => {
    const s = await setup();
    const { base, taskId } = await withTask(s);
    await request(app).post(`${base}/${taskId}/assign`).set(auth(s.admin)).send({ userId: s.member2.userId });

    expect((await request(app).post(`${base}/${taskId}/unassign`).set(auth(s.member)).send()).status).toBe(403);
    expect((await request(app).post(`${base}/${taskId}/unassign`).set(auth(s.viewer)).send()).status).toBe(403);
    expect((await request(app).post(`${base}/${taskId}/unassign`).set(auth(s.member2)).send()).status).toBe(200);
  });

  it('setLabels: 422 when a label belongs to another organization or does not exist', async () => {
    const s = await setup();
    const { base, taskId } = await withTask(s);
    const other = await registerAndGetSession(app, outsider);
    const foreign = await request(app)
      .post(`/v1/organizations/${other.organizationId}/labels`)
      .set(auth(other))
      .send({ name: 'Foreign', color: '#123456' });

    expect((await request(app).put(`${base}/${taskId}/labels`).set(auth(s.member)).send({ labelIds: [foreign.body.id] })).status).toBe(422);
    expect((await request(app).put(`${base}/${taskId}/labels`).set(auth(s.member)).send({ labelIds: [randomUUID()] })).status).toBe(422);
    expect((await request(app).put(`${base}/${taskId}/labels`).set(auth(s.member)).send({ labelIds: ['nope'] })).status).toBe(400);
  });

  it('creating a task with an assignee outside the organization is 422', async () => {
    const s = await setup();
    const { base } = await withTask(s);
    const stranger = await registerAndGetSession(app, outsider);
    const response = await request(app).post(base).set(auth(s.admin)).send({ title: 'x', priority: 'LOW', assigneeId: stranger.userId });
    expect(response.status).toBe(422);
  });

  it('the cross-project "assigned to me" list is readable by a VIEWER and rejects bad filters', async () => {
    const s = await setup();
    expect((await request(app).get(`${s.org}/tasks`).set(auth(s.viewer))).status).toBe(200);
    expect((await request(app).get(`${s.org}/tasks?limit=1000`).set(auth(s.viewer))).status).toBe(400);
    const other = await registerAndGetSession(app, outsider);
    expect((await request(app).get(`${s.org}/tasks`).set(auth(other))).status).toBe(404);
  });
});
