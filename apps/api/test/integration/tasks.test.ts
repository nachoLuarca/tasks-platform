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
const otherMember = { email: 'annie.easley@example.com', password: 'correct-horse-battery', name: 'Annie Easley' };
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
  otherMember: RegisteredSession;
  viewer: RegisteredSession;
  organizationId: string;
  projectId: string;
}

async function setupProjectWithAllRoles(): Promise<Setup> {
  const ownerSession = await registerAndGetSession(app, owner);
  const { organizationId } = ownerSession;

  const adminSession = await addMember(ownerSession.accessToken, organizationId, admin, 'ADMIN');
  const memberSession = await addMember(ownerSession.accessToken, organizationId, member, 'MEMBER');
  const otherMemberSession = await addMember(ownerSession.accessToken, organizationId, otherMember, 'MEMBER');
  const viewerSession = await addMember(ownerSession.accessToken, organizationId, viewer, 'VIEWER');

  const project = await request(app)
    .post(`/v1/organizations/${organizationId}/projects`)
    .set('Authorization', `Bearer ${ownerSession.accessToken}`)
    .send({ key: 'ENG', name: 'Engineering' });

  return {
    owner: ownerSession,
    admin: adminSession,
    member: memberSession,
    otherMember: otherMemberSession,
    viewer: viewerSession,
    organizationId,
    projectId: project.body.id as string,
  };
}

function tasksUrl(organizationId: string, projectId: string, suffix = ''): string {
  return `/v1/organizations/${organizationId}/projects/${projectId}/tasks${suffix}`;
}

async function createTask(
  accessToken: string,
  organizationId: string,
  projectId: string,
  overrides: Partial<{ title: string; description: string; priority: string; assigneeId: string; dueDate: string }> = {},
) {
  return request(app)
    .post(tasksUrl(organizationId, projectId))
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ title: 'Fix the heat shield', ...overrides });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('task numbering', () => {
  it('numbers tasks sequentially within a project, starting at 1', async () => {
    const setup = await setupProjectWithAllRoles();

    const first = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: 'One' });
    const second = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: 'Two' });
    const third = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: 'Three' });

    expect([first.body.number, second.body.number, third.body.number]).toEqual([1, 2, 3]);
  });

  it('never hands out the same number to two concurrent creations', async () => {
    const setup = await setupProjectWithAllRoles();
    const concurrency = 15;

    const responses = await Promise.all(
      Array.from({ length: concurrency }, (_, index) =>
        createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: `Concurrent ${index}` }),
      ),
    );

    const numbers = responses.map((response) => response.body.number as number);
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(new Set(numbers).size).toBe(concurrency);
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: concurrency }, (_, index) => index + 1));
  });

  it('does not reuse a number after the task holding it is deleted', async () => {
    const setup = await setupProjectWithAllRoles();
    const first = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);
    await request(app)
      .delete(tasksUrl(setup.organizationId, setup.projectId, `/${first.body.id}`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const second = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);
    expect(second.body.number).toBe(2);
  });
});

describe('optimistic locking', () => {
  it('updates successfully with the current version', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ version: created.body.version, title: 'Updated title' });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Updated title');
    expect(response.body.version).toBe(created.body.version + 1);
  });

  it('rejects an update sent with a stale version with 409', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ version: created.body.version, title: 'First update' });

    const staleResponse = await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ version: created.body.version, title: 'Conflicting update' });

    expect(staleResponse.status).toBe(409);
  });

  it('marks completedAt when moving to DONE, and clears it when moving away from DONE', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const done = await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ version: created.body.version, status: 'DONE' });
    expect(done.status).toBe(200);
    expect(done.body.completedAt).not.toBeNull();

    const reopened = await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ version: done.body.version, status: 'IN_PROGRESS' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.completedAt).toBeNull();
  });
});

describe('ownership: own vs any', () => {
  it('a MEMBER can update a task they created', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.member.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}`))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ version: created.body.version, title: 'Renamed by creator' });

    expect(response.status).toBe(200);
  });

  it('a MEMBER cannot update a task created and owned by someone else', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}`))
      .set('Authorization', `Bearer ${setup.otherMember.accessToken}`)
      .send({ version: created.body.version, title: 'Should not work' });

    expect(response.status).toBe(403);
  });

  it('a MEMBER can update a task assigned to them, even if someone else created it', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: setup.member.userId,
    });

    const response = await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}`))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ version: created.body.version, title: 'Updated by assignee' });

    expect(response.status).toBe(200);
  });

  it('an ADMIN can update any task', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.member.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}`))
      .set('Authorization', `Bearer ${setup.admin.accessToken}`)
      .send({ version: created.body.version, title: 'Updated by admin' });

    expect(response.status).toBe(200);
  });

  it('a VIEWER cannot create or update any task', async () => {
    const setup = await setupProjectWithAllRoles();

    const createResponse = await createTask(setup.viewer.accessToken, setup.organizationId, setup.projectId);
    expect(createResponse.status).toBe(403);

    const existing = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);
    const updateResponse = await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${existing.body.id}`))
      .set('Authorization', `Bearer ${setup.viewer.accessToken}`)
      .send({ version: existing.body.version, title: 'Should not work' });
    expect(updateResponse.status).toBe(403);
  });

  it('a MEMBER can delete their own task but not one owned by someone else', async () => {
    const setup = await setupProjectWithAllRoles();
    const own = await createTask(setup.member.accessToken, setup.organizationId, setup.projectId);
    const someoneElses = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const deleteOwn = await request(app)
      .delete(tasksUrl(setup.organizationId, setup.projectId, `/${own.body.id}`))
      .set('Authorization', `Bearer ${setup.member.accessToken}`);
    expect(deleteOwn.status).toBe(204);

    const deleteOthers = await request(app)
      .delete(tasksUrl(setup.organizationId, setup.projectId, `/${someoneElses.body.id}`))
      .set('Authorization', `Bearer ${setup.member.accessToken}`);
    expect(deleteOthers.status).toBe(403);
  });
});

describe('assignment', () => {
  it('assigns a task to a member of the organization', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .post(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}/assign`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ userId: setup.member.userId });

    expect(response.status).toBe(200);
    expect(response.body.assigneeId).toBe(setup.member.userId);
  });

  it('rejects assigning a task to someone outside the organization with 422', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);
    const outsiderSession = await registerAndGetSession(app, outsider);

    const response = await request(app)
      .post(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}/assign`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ userId: outsiderSession.userId });

    expect(response.status).toBe(422);
  });

  it('rejects creating a task assigned to someone outside the organization with 422', async () => {
    const setup = await setupProjectWithAllRoles();
    const outsiderSession = await registerAndGetSession(app, outsider);

    const response = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: outsiderSession.userId,
    });

    expect(response.status).toBe(422);
  });

  it('unassigns a task', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: setup.member.userId,
    });

    const response = await request(app)
      .post(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}/unassign`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.assigneeId).toBeNull();
  });

  it('a MEMBER cannot assign tasks', async () => {
    const setup = await setupProjectWithAllRoles();
    const created = await createTask(setup.member.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .post(tasksUrl(setup.organizationId, setup.projectId, `/${created.body.id}/assign`))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ userId: setup.otherMember.userId });

    expect(response.status).toBe(403);
  });
});

describe('filters and sorting', () => {
  it('filters by status', async () => {
    const setup = await setupProjectWithAllRoles();
    const todo = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: 'Todo task' });
    const inProgress = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: 'WIP task' });
    await request(app)
      .patch(tasksUrl(setup.organizationId, setup.projectId, `/${inProgress.body.id}`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ version: inProgress.body.version, status: 'IN_PROGRESS' });

    const response = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ status: 'TODO' })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const ids = (response.body.data as { id: string }[]).map((task) => task.id);
    expect(ids).toEqual([todo.body.id]);
  });

  it('filters by priority', async () => {
    const setup = await setupProjectWithAllRoles();
    const urgent = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { priority: 'URGENT' });
    await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { priority: 'LOW' });

    const response = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ priority: 'URGENT' })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const ids = (response.body.data as { id: string }[]).map((task) => task.id);
    expect(ids).toEqual([urgent.body.id]);
  });

  it('filters by assignee', async () => {
    const setup = await setupProjectWithAllRoles();
    const assigned = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: setup.member.userId,
    });
    await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ assigneeId: setup.member.userId })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const ids = (response.body.data as { id: string }[]).map((task) => task.id);
    expect(ids).toEqual([assigned.body.id]);
  });

  it('filters by unassigned', async () => {
    const setup = await setupProjectWithAllRoles();
    await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { assigneeId: setup.member.userId });
    const unassigned = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ unassigned: 'true' })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const ids = (response.body.data as { id: string }[]).map((task) => task.id);
    expect(ids).toEqual([unassigned.body.id]);
  });

  it('filters by due date range', async () => {
    const setup = await setupProjectWithAllRoles();
    const early = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      dueDate: '2026-01-01T00:00:00.000Z',
    });
    const late = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      dueDate: '2026-12-01T00:00:00.000Z',
    });

    const before = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ dueBefore: '2026-06-01T00:00:00.000Z' })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    expect((before.body.data as { id: string }[]).map((task) => task.id)).toEqual([early.body.id]);

    const after = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ dueAfter: '2026-06-01T00:00:00.000Z' })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    expect((after.body.data as { id: string }[]).map((task) => task.id)).toEqual([late.body.id]);
  });

  it('searches by title', async () => {
    const setup = await setupProjectWithAllRoles();
    const match = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: 'Fix heat shield' });
    await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: 'Write documentation' });

    const response = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ search: 'heat' })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    expect((response.body.data as { id: string }[]).map((task) => task.id)).toEqual([match.body.id]);
  });

  it('sorts by priority ascending and descending', async () => {
    const setup = await setupProjectWithAllRoles();
    const low = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { priority: 'LOW' });
    const urgent = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { priority: 'URGENT' });

    const ascending = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ sortBy: 'priority', sortOrder: 'asc' })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    expect((ascending.body.data as { id: string }[]).map((task) => task.id)).toEqual([low.body.id, urgent.body.id]);

    const descending = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ sortBy: 'priority', sortOrder: 'desc' })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    expect((descending.body.data as { id: string }[]).map((task) => task.id)).toEqual([urgent.body.id, low.body.id]);
  });

  it('sorts by due date', async () => {
    const setup = await setupProjectWithAllRoles();
    const late = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      dueDate: '2026-12-01T00:00:00.000Z',
    });
    const early = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      dueDate: '2026-01-01T00:00:00.000Z',
    });

    const response = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ sortBy: 'dueDate', sortOrder: 'asc' })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    expect((response.body.data as { id: string }[]).map((task) => task.id)).toEqual([early.body.id, late.body.id]);
  });
});

describe('pagination', () => {
  it('traverses the full set exactly once, in creation order, regardless of page size', async () => {
    const setup = await setupProjectWithAllRoles();
    const created: string[] = [];
    for (let index = 0; index < 7; index += 1) {
      const response = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
        title: `Task ${index}`,
      });
      created.push(response.body.id as string);
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await request(app)
        .get(tasksUrl(setup.organizationId, setup.projectId))
        .query({ limit: 3, ...(cursor ? { cursor } : {}) })
        .set('Authorization', `Bearer ${setup.owner.accessToken}`);
      seen.push(...(response.body.data as { id: string }[]).map((task) => task.id));
      cursor = response.body.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    // Default sort is createdAt desc, so the most recently created comes first.
    expect(seen).toEqual([...created].reverse());
  });
});

describe('project deletion hides its tasks', () => {
  it('a deleted project 404s on its task routes', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    await request(app)
      .delete(`/v1/organizations/${setup.organizationId}/projects/${setup.projectId}`)
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const listResponse = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    expect(listResponse.status).toBe(404);

    const getResponse = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId, `/${task.body.id}`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    expect(getResponse.status).toBe(404);
  });

  it('a deleted project no longer contributes to the organization-wide assigned-to-me list', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: setup.owner.userId,
    });

    await request(app)
      .delete(`/v1/organizations/${setup.organizationId}/projects/${setup.projectId}`)
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const response = await request(app)
      .get(`/v1/organizations/${setup.organizationId}/tasks`)
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    expect(response.status).toBe(200);
    expect((response.body.data as { id: string }[]).map((t) => t.id)).not.toContain(task.body.id);
  });
});

describe('organization-wide assigned-to-me listing', () => {
  it('lists tasks assigned to the caller across every project', async () => {
    const setup = await setupProjectWithAllRoles();
    const assignedToOwner = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: setup.owner.userId,
    });
    await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { assigneeId: setup.member.userId });

    const response = await request(app)
      .get(`/v1/organizations/${setup.organizationId}/tasks`)
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    expect(response.status).toBe(200);
    const ids = (response.body.data as { id: string }[]).map((task) => task.id);
    expect(ids).toEqual([assignedToOwner.body.id]);
  });
});

describe('non-member access', () => {
  it('returns 404, not 403, on every task route for a non-member', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);
    const outsiderSession = await registerAndGetSession(app, outsider);
    const auth = { Authorization: `Bearer ${outsiderSession.accessToken}` };

    const responses = await Promise.all([
      request(app).get(tasksUrl(setup.organizationId, setup.projectId)).set(auth),
      request(app).post(tasksUrl(setup.organizationId, setup.projectId)).set(auth).send({ title: 'x' }),
      request(app).get(tasksUrl(setup.organizationId, setup.projectId, `/${task.body.id}`)).set(auth),
      request(app)
        .patch(tasksUrl(setup.organizationId, setup.projectId, `/${task.body.id}`))
        .set(auth)
        .send({ version: 1, title: 'x' }),
      request(app).delete(tasksUrl(setup.organizationId, setup.projectId, `/${task.body.id}`)).set(auth),
      request(app)
        .post(tasksUrl(setup.organizationId, setup.projectId, `/${task.body.id}/assign`))
        .set(auth)
        .send({ userId: outsiderSession.userId }),
      request(app).post(tasksUrl(setup.organizationId, setup.projectId, `/${task.body.id}/unassign`)).set(auth),
      request(app).get(`/v1/organizations/${setup.organizationId}/tasks`).set(auth),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
    }
  });
});

describe('listing query efficiency', () => {
  it('fetching a page of tasks with their assignee runs a constant number of queries, not one per task', async () => {
    const setup = await setupProjectWithAllRoles();
    for (let index = 0; index < 10; index += 1) {
      await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
        title: `Task ${index}`,
        assigneeId: setup.member.userId,
      });
    }

    // A single listener for the whole test, cleared between requests --
    // PrismaClient's $on has no public $off to detach it again.
    let queryCount = 0;
    prisma.$on('query', () => {
      queryCount += 1;
    });

    queryCount = 0;
    const smallResponse = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ limit: 3 })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    const smallPageQueries = queryCount;
    expect(smallResponse.status).toBe(200);
    expect(smallResponse.body.data).toHaveLength(3);

    queryCount = 0;
    const largeResponse = await request(app)
      .get(tasksUrl(setup.organizationId, setup.projectId))
      .query({ limit: 10 })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    const largePageQueries = queryCount;
    expect(largeResponse.status).toBe(200);
    expect(largeResponse.body.data).toHaveLength(10);

    // Fetching more rows (with their assignee joined in) must not scale the
    // query count -- both pages resolve in the same number of queries, never
    // "one per task". That fixed cost includes the authorization chain's own
    // lookups (organization, membership, project), which are constant
    // regardless of page size, not just the listing query itself.
    expect(largePageQueries).toBe(smallPageQueries);
    expect(smallPageQueries).toBeLessThan(10);
  });
});
