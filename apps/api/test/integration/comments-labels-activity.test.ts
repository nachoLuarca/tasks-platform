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

function taskUrl(organizationId: string, projectId: string, taskId: string, suffix = ''): string {
  return `/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}${suffix}`;
}

async function createTask(
  accessToken: string,
  organizationId: string,
  projectId: string,
  overrides: Partial<{ title: string; assigneeId: string }> = {},
) {
  return request(app)
    .post(`/v1/organizations/${organizationId}/projects/${projectId}/tasks`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ title: 'Fix the heat shield', ...overrides });
}

async function createLabel(
  accessToken: string,
  organizationId: string,
  overrides: Partial<{ name: string; color: string }> = {},
) {
  return request(app)
    .post(`/v1/organizations/${organizationId}/labels`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Bug', color: '#FF0000', ...overrides });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('comments', () => {
  it('the author edits their own comment and editedAt is set', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.member.accessToken, setup.organizationId, setup.projectId);
    const comment = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments'))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ body: 'Looks good' });
    expect(comment.status).toBe(201);
    expect(comment.body.editedAt).toBeNull();

    const edited = await request(app)
      .patch(taskUrl(setup.organizationId, setup.projectId, task.body.id, `/comments/${comment.body.id}`))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ body: 'Looks good, approved' });

    expect(edited.status).toBe(200);
    expect(edited.body.body).toBe('Looks good, approved');
    expect(edited.body.editedAt).not.toBeNull();
  });

  it('nobody else can edit a comment, not even the OWNER', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.member.accessToken, setup.organizationId, setup.projectId);
    const comment = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments'))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ body: 'Original text' });

    const asOwner = await request(app)
      .patch(taskUrl(setup.organizationId, setup.projectId, task.body.id, `/comments/${comment.body.id}`))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ body: 'Rewritten by owner' });
    expect(asOwner.status).toBe(403);

    const asAdmin = await request(app)
      .patch(taskUrl(setup.organizationId, setup.projectId, task.body.id, `/comments/${comment.body.id}`))
      .set('Authorization', `Bearer ${setup.admin.accessToken}`)
      .send({ body: 'Rewritten by admin' });
    expect(asAdmin.status).toBe(403);
  });

  it('an ADMIN deletes the comment of another member; a MEMBER cannot', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.member.accessToken, setup.organizationId, setup.projectId);
    const comment = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments'))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ body: 'To be moderated' });

    const memberAttempt = await request(app)
      .delete(taskUrl(setup.organizationId, setup.projectId, task.body.id, `/comments/${comment.body.id}`))
      .set('Authorization', `Bearer ${setup.otherMember.accessToken}`);
    expect(memberAttempt.status).toBe(403);

    const adminAttempt = await request(app)
      .delete(taskUrl(setup.organizationId, setup.projectId, task.body.id, `/comments/${comment.body.id}`))
      .set('Authorization', `Bearer ${setup.admin.accessToken}`);
    expect(adminAttempt.status).toBe(204);
  });

  it('a VIEWER cannot create a comment', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments'))
      .set('Authorization', `Bearer ${setup.viewer.accessToken}`)
      .send({ body: 'I should not be able to do this' });

    expect(response.status).toBe(403);
  });

  it('lists comments with their author without one query per comment', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);
    for (let index = 0; index < 10; index += 1) {
      await request(app)
        .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments'))
        .set('Authorization', `Bearer ${setup.owner.accessToken}`)
        .send({ body: `Comment ${index}` });
    }

    // A single listener for the whole test, cleared between requests --
    // PrismaClient's $on has no public $off to detach it again.
    let queryCount = 0;
    prisma.$on('query', () => {
      queryCount += 1;
    });

    queryCount = 0;
    const smallResponse = await request(app)
      .get(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments'))
      .query({ limit: 3 })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    const smallPageQueries = queryCount;
    expect(smallResponse.status).toBe(200);
    expect(smallResponse.body.data).toHaveLength(3);
    expect(smallResponse.body.data[0].author.email).toBe(owner.email.toLowerCase());

    queryCount = 0;
    const largeResponse = await request(app)
      .get(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments'))
      .query({ limit: 10 })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    const largePageQueries = queryCount;
    expect(largeResponse.status).toBe(200);
    expect(largeResponse.body.data).toHaveLength(10);

    // Same reasoning as tasks.test.ts "listing query efficiency": fetching
    // more rows (with their author joined in) must not scale the query
    // count -- both pages resolve in the same number of queries, never "one
    // per comment".
    expect(largePageQueries).toBe(smallPageQueries);
  });
});

describe('labels', () => {
  it('two labels with the same name in different casing collide', async () => {
    const setup = await setupProjectWithAllRoles();
    await createLabel(setup.owner.accessToken, setup.organizationId, { name: 'Bug' });

    const response = await createLabel(setup.owner.accessToken, setup.organizationId, { name: 'bug' });
    expect(response.status).toBe(409);
  });

  it('the same label name can exist in two different organizations', async () => {
    const setup = await setupProjectWithAllRoles();
    const first = await createLabel(setup.owner.accessToken, setup.organizationId, { name: 'Bug' });
    expect(first.status).toBe(201);

    const otherOrgSession = await registerAndGetSession(app, outsider);
    const second = await createLabel(otherOrgSession.accessToken, otherOrgSession.organizationId, { name: 'Bug' });
    expect(second.status).toBe(201);
  });

  it('only ADMIN/OWNER can manage labels; a MEMBER cannot', async () => {
    const setup = await setupProjectWithAllRoles();
    const response = await createLabel(setup.member.accessToken, setup.organizationId);
    expect(response.status).toBe(403);
  });

  it('deleting a label detaches it from tasks without deleting them', async () => {
    const setup = await setupProjectWithAllRoles();
    const label = await createLabel(setup.owner.accessToken, setup.organizationId);
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    await request(app)
      .put(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/labels'))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ labelIds: [label.body.id] });

    const deleted = await request(app)
      .delete(`/v1/organizations/${setup.organizationId}/labels/${label.body.id}`)
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    expect(deleted.status).toBe(204);

    const fetched = await request(app)
      .get(taskUrl(setup.organizationId, setup.projectId, task.body.id))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.labels).toEqual([]);
  });

  it('sets a task label set governed by task:update, not label:manage', async () => {
    const setup = await setupProjectWithAllRoles();
    const label = await createLabel(setup.owner.accessToken, setup.organizationId, { name: 'Urgent' });
    const own = await createTask(setup.member.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .put(taskUrl(setup.organizationId, setup.projectId, own.body.id, '/labels'))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ labelIds: [label.body.id] });

    expect(response.status).toBe(200);
    expect(response.body.labels).toEqual([{ id: label.body.id, name: 'Urgent', color: '#FF0000' }]);
  });

  it('rejects labels that do not belong to the organization', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const otherOrgSession = await registerAndGetSession(app, outsider);
    const foreignLabel = await createLabel(otherOrgSession.accessToken, otherOrgSession.organizationId);

    const response = await request(app)
      .put(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/labels'))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ labelIds: [foreignLabel.body.id] });

    expect(response.status).toBe(422);
  });

  it('filters tasks by label', async () => {
    const setup = await setupProjectWithAllRoles();
    const label = await createLabel(setup.owner.accessToken, setup.organizationId);
    const tagged = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: 'Tagged' });
    await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, { title: 'Untagged' });

    await request(app)
      .put(taskUrl(setup.organizationId, setup.projectId, tagged.body.id, '/labels'))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ labelIds: [label.body.id] });

    const response = await request(app)
      .get(`/v1/organizations/${setup.organizationId}/projects/${setup.projectId}/tasks`)
      .query({ labelId: label.body.id })
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    expect((response.body.data as { id: string }[]).map((t) => t.id)).toEqual([tagged.body.id]);
  });
});

describe('self-assignment', () => {
  it('a MEMBER claims an unassigned task', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/assign'))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ userId: setup.member.userId });

    expect(response.status).toBe(200);
    expect(response.body.assigneeId).toBe(setup.member.userId);
  });

  it('a MEMBER cannot assign an unassigned task to someone else', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/assign'))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ userId: setup.otherMember.userId });

    expect(response.status).toBe(403);
  });

  it('a MEMBER cannot claim a task that already has an assignee', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: setup.otherMember.userId,
    });

    const response = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/assign'))
      .set('Authorization', `Bearer ${setup.member.accessToken}`)
      .send({ userId: setup.member.userId });

    expect(response.status).toBe(409);
  });

  it('a MEMBER drops a task assigned to them, but cannot unassign someone else', async () => {
    const setup = await setupProjectWithAllRoles();
    const own = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: setup.member.userId,
    });
    const someoneElses = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: setup.otherMember.userId,
    });

    const dropsOwn = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, own.body.id, '/unassign'))
      .set('Authorization', `Bearer ${setup.member.accessToken}`);
    expect(dropsOwn.status).toBe(200);
    expect(dropsOwn.body.assigneeId).toBeNull();

    const dropsOthers = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, someoneElses.body.id, '/unassign'))
      .set('Authorization', `Bearer ${setup.member.accessToken}`);
    expect(dropsOthers.status).toBe(403);
  });

  it('ADMIN/OWNER with task:assign can still assign anyone to anyone', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId, {
      assigneeId: setup.otherMember.userId,
    });

    const response = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/assign'))
      .set('Authorization', `Bearer ${setup.admin.accessToken}`)
      .send({ userId: setup.member.userId });

    expect(response.status).toBe(200);
    expect(response.body.assigneeId).toBe(setup.member.userId);
  });

  it('a VIEWER cannot self-assign', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/assign'))
      .set('Authorization', `Bearer ${setup.viewer.accessToken}`)
      .send({ userId: setup.viewer.userId });

    expect(response.status).toBe(403);
  });
});

describe('activity log', () => {
  it('records task creation', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .get(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/activity'))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].type).toBe('TASK_CREATED');
  });

  it('a status change leaves an entry with the previous and new value', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    await request(app)
      .patch(taskUrl(setup.organizationId, setup.projectId, task.body.id))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ version: task.body.version, status: 'IN_PROGRESS' });

    const response = await request(app)
      .get(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/activity'))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const statusEntry = (response.body.data as { type: string; changes: { before: unknown; after: unknown } }[]).find(
      (entry) => entry.type === 'STATUS_CHANGED',
    );
    expect(statusEntry).toBeDefined();
    expect(statusEntry?.changes).toEqual({ before: 'TODO', after: 'IN_PROGRESS' });
  });

  it('records a new comment as COMMENT_ADDED', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);
    await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments'))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ body: 'A comment' });

    const response = await request(app)
      .get(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/activity'))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`);

    const types = (response.body.data as { type: string }[]).map((entry) => entry.type);
    expect(types).toContain('COMMENT_ADDED');
  });

  it(
    'a rejected update (real stale-version 409, not a mock) leaves no trace in the activity log',
    async () => {
      const setup = await setupProjectWithAllRoles();
      const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

      const successful = await request(app)
        .patch(taskUrl(setup.organizationId, setup.projectId, task.body.id))
        .set('Authorization', `Bearer ${setup.owner.accessToken}`)
        .send({ version: task.body.version, title: 'Renamed once' });
      expect(successful.status).toBe(200);

      const beforeCount = (
        await request(app)
          .get(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/activity'))
          .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      ).body.data.length;

      // Reuses the *stale* (already-consumed) version on purpose: this goes
      // through the exact same transaction tasksService.update always uses,
      // hits a real Postgres UPDATE affecting 0 rows because the version no
      // longer matches, and the service throws for real inside that
      // transaction -- causing a real ROLLBACK, not a simulated one.
      const rejected = await request(app)
        .patch(taskUrl(setup.organizationId, setup.projectId, task.body.id))
        .set('Authorization', `Bearer ${setup.owner.accessToken}`)
        .send({ version: task.body.version, title: 'Should never land' });
      expect(rejected.status).toBe(409);

      const afterResponse = await request(app)
        .get(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/activity'))
        .set('Authorization', `Bearer ${setup.owner.accessToken}`);
      expect(afterResponse.body.data).toHaveLength(beforeCount);
      expect((afterResponse.body.data as { changes: { after: unknown } }[]).some((entry) => entry.changes.after === 'Should never land')).toBe(
        false,
      );
    },
  );

  it('the activity log has no write endpoint', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);

    const response = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/activity'))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ type: 'TASK_CREATED' });

    expect(response.status).toBe(404);
  });
});

describe('non-member access', () => {
  it('returns 404, not 403, on comment, label, and activity routes for a non-member', async () => {
    const setup = await setupProjectWithAllRoles();
    const task = await createTask(setup.owner.accessToken, setup.organizationId, setup.projectId);
    const comment = await request(app)
      .post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments'))
      .set('Authorization', `Bearer ${setup.owner.accessToken}`)
      .send({ body: 'x' });
    const label = await createLabel(setup.owner.accessToken, setup.organizationId);

    const outsiderSession = await registerAndGetSession(app, outsider);
    const auth = { Authorization: `Bearer ${outsiderSession.accessToken}` };

    const responses = await Promise.all([
      request(app).get(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments')).set(auth),
      request(app).post(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/comments')).set(auth).send({ body: 'x' }),
      request(app)
        .patch(taskUrl(setup.organizationId, setup.projectId, task.body.id, `/comments/${comment.body.id}`))
        .set(auth)
        .send({ body: 'x' }),
      request(app).delete(taskUrl(setup.organizationId, setup.projectId, task.body.id, `/comments/${comment.body.id}`)).set(auth),
      request(app).get(`/v1/organizations/${setup.organizationId}/labels`).set(auth),
      request(app).post(`/v1/organizations/${setup.organizationId}/labels`).set(auth).send({ name: 'x', color: '#FFFFFF' }),
      request(app).delete(`/v1/organizations/${setup.organizationId}/labels/${label.body.id}`).set(auth),
      request(app).get(taskUrl(setup.organizationId, setup.projectId, task.body.id, '/activity')).set(auth),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
    }
  });
});
