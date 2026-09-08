import type { Role, TaskListQuery, TaskPriority } from '@tasks-platform/contracts';

import { canActOnResource, roleHasPermission } from '../../shared/authorization/index.js';
import { prisma } from '../../shared/db/index.js';
import { ConflictError, ForbiddenError, UnprocessableEntityError } from '../../shared/errors/index.js';
import { buildPage, decodeCursor, type Page } from '../../shared/pagination/index.js';
import { activityService } from '../activity/activity.service.js';
import type { RecordActivityInput } from '../activity/activity.types.js';
import { labelsService } from '../labels/labels.service.js';
import { membersRepository } from '../members/members.repository.js';
import type { ProjectEntity } from '../projects/projects.types.js';
import { tasksRepository } from './tasks.repository.js';
import type { CreateTaskInput, TaskEntity, TaskListFilter } from './tasks.types.js';

/** "Own" per PHASE.md decision 5 (Phase 3): creator or assignee of *this* task. */
function isOwnTask(task: TaskEntity, userId: string): boolean {
  return task.createdById === userId || task.assigneeId === userId;
}

async function assertAssigneeIsMember(organizationId: string, assigneeId: string): Promise<void> {
  const membership = await membersRepository.findByUserAndOrganization(assigneeId, organizationId);
  if (!membership) {
    throw new UnprocessableEntityError('The assignee must be a member of the organization');
  }
}

function toListFilter(query: TaskListQuery): TaskListFilter {
  return {
    status: query.status,
    priority: query.priority,
    assigneeId: query.assigneeId,
    unassigned: query.unassigned,
    dueBefore: query.dueBefore ? new Date(query.dueBefore) : undefined,
    dueAfter: query.dueAfter ? new Date(query.dueAfter) : undefined,
    search: query.search,
    labelId: query.labelId,
  };
}

/** Fields tasksService.update may change, diffed against the task as it was before the update. */
function diffTaskFields(
  before: TaskEntity,
  after: TaskEntity,
  actorId: string,
  input: { title?: string; status?: TaskEntity['status']; priority?: TaskPriority; dueDate?: string | null },
): RecordActivityInput[] {
  const entries: RecordActivityInput[] = [];
  const base = { taskId: after.id, actorId };

  if (input.title !== undefined && input.title !== before.title) {
    entries.push({ ...base, type: 'TITLE_CHANGED', before: before.title, after: after.title });
  }
  if (input.status !== undefined && input.status !== before.status) {
    entries.push({ ...base, type: 'STATUS_CHANGED', before: before.status, after: after.status });
  }
  if (input.priority !== undefined && input.priority !== before.priority) {
    entries.push({ ...base, type: 'PRIORITY_CHANGED', before: before.priority, after: after.priority });
  }
  if (input.dueDate !== undefined) {
    const beforeIso = before.dueDate ? before.dueDate.toISOString() : null;
    const afterIso = after.dueDate ? after.dueDate.toISOString() : null;
    if (beforeIso !== afterIso) {
      entries.push({ ...base, type: 'DUE_DATE_CHANGED', before: beforeIso, after: afterIso });
    }
  }
  return entries;
}

export const tasksService = {
  async create(
    project: ProjectEntity,
    createdById: string,
    input: { title: string; description?: string; priority: TaskPriority; assigneeId?: string; dueDate?: string },
  ): Promise<TaskEntity> {
    if (input.assigneeId) {
      await assertAssigneeIsMember(project.organizationId, input.assigneeId);
    }

    const createInput: CreateTaskInput = {
      projectId: project.id,
      title: input.title,
      description: input.description,
      priority: input.priority,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      createdById,
    };

    // The counter claim, the row insert and the TASK_CREATED entry all
    // happen in one transaction, so an activity entry can never exist for a
    // task number that wasn't actually handed out (see tasks.repository.ts).
    return prisma.$transaction(async (tx) => {
      const task = await tasksRepository.createWithNextNumber(createInput, tx);
      await activityService.record(
        { taskId: task.id, actorId: createdById, type: 'TASK_CREATED', before: null, after: { title: task.title, status: task.status } },
        tx,
      );
      return task;
    });
  },

  async list(project: ProjectEntity, query: TaskListQuery): Promise<Page<TaskEntity>> {
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await tasksRepository.list(
      project.id,
      toListFilter(query),
      query.sortBy,
      query.sortOrder,
      cursorId,
      query.limit,
    );
    return buildPage(rows, query.limit);
  },

  async listAssignedToUser(organizationId: string, userId: string, query: TaskListQuery): Promise<Page<TaskEntity>> {
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await tasksRepository.listAssignedToUser(
      organizationId,
      userId,
      toListFilter(query),
      query.sortBy,
      query.sortOrder,
      cursorId,
      query.limit,
    );
    return buildPage(rows, query.limit);
  },

  /**
   * `role` and `actorId` decide "own vs any" through the permission matrix
   * (`canActOnResource`) plus a plain id comparison for ownership -- never a
   * role comparison. Returns the updated task, or throws 409 on a version
   * mismatch. The update and its activity entries share one transaction: if
   * the version is stale, `updateWithVersion` writes nothing and this throws
   * before a single activity row is written, so a rolled-back/rejected
   * update never leaves a trace (PHASE.md decision 6) -- see
   * test/integration/tasks.test.ts "activity log" for the test that proves
   * this end to end, by forcing a real stale-version 409, not a mock.
   */
  async update(
    task: TaskEntity,
    role: Role,
    actorId: string,
    input: { title?: string; description?: string | null; status?: TaskEntity['status']; priority?: TaskPriority; dueDate?: string | null; version: number },
  ): Promise<TaskEntity> {
    if (!canActOnResource(role, 'task:update:any', 'task:update:own', isOwnTask(task, actorId))) {
      throw new ForbiddenError('Missing permission: task:update:own or task:update:any');
    }

    const patch: Parameters<typeof tasksRepository.updateWithVersion>[2] = {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate === null ? null : new Date(input.dueDate),
    };

    if (input.status === 'DONE' && task.status !== 'DONE') {
      patch.completedAt = new Date();
    } else if (input.status && input.status !== 'DONE' && task.status === 'DONE') {
      patch.completedAt = null;
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tasksRepository.updateWithVersion(task.id, input.version, patch, tx);
      if (!updated) {
        throw new ConflictError('Task was modified by someone else; reload and try again');
      }

      const changes = diffTaskFields(task, updated, actorId, input);
      for (const entry of changes) {
        await activityService.record(entry, tx);
      }

      return updated;
    });
  },

  async remove(task: TaskEntity, role: Role, actorId: string): Promise<void> {
    if (!canActOnResource(role, 'task:delete:any', 'task:delete:own', isOwnTask(task, actorId))) {
      throw new ForbiddenError('Missing permission: task:delete:own or task:delete:any');
    }
    await tasksRepository.softDelete(task.id);
  },

  /**
   * `task:assign` (ADMIN/OWNER) can move the task to anyone. `task:assign:self`
   * (also granted to MEMBER, Phase 3.5) only lets the caller take an
   * unassigned task for themself -- not reassign someone else's, and not
   * hand a task to a third party. See permissions.ts for why this can't be
   * expressed as a single permission check.
   */
  async assign(task: TaskEntity, role: Role, actorId: string, organizationId: string, assigneeId: string): Promise<TaskEntity> {
    if (!roleHasPermission(role, 'task:assign')) {
      if (!roleHasPermission(role, 'task:assign:self')) {
        throw new ForbiddenError('Missing permission: task:assign or task:assign:self');
      }
      if (assigneeId !== actorId) {
        throw new ForbiddenError('task:assign:self only lets you assign a task to yourself');
      }
      if (task.assigneeId !== null) {
        throw new ConflictError('Task already has an assignee');
      }
    }

    await assertAssigneeIsMember(organizationId, assigneeId);

    return prisma.$transaction(async (tx) => {
      const updated = await tasksRepository.assign(task.id, assigneeId, tx);
      await activityService.record(
        { taskId: task.id, actorId, type: 'ASSIGNEE_CHANGED', before: task.assigneeId, after: assigneeId },
        tx,
      );
      return updated;
    });
  },

  async unassign(task: TaskEntity, role: Role, actorId: string): Promise<TaskEntity> {
    if (!roleHasPermission(role, 'task:assign')) {
      if (!roleHasPermission(role, 'task:assign:self')) {
        throw new ForbiddenError('Missing permission: task:assign or task:assign:self');
      }
      if (task.assigneeId !== actorId) {
        throw new ForbiddenError('task:assign:self only lets you unassign yourself');
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tasksRepository.assign(task.id, null, tx);
      await activityService.record(
        { taskId: task.id, actorId, type: 'ASSIGNEE_CHANGED', before: task.assigneeId, after: null },
        tx,
      );
      return updated;
    });
  },

  /** Governed by task:update:own/:any (PHASE.md decision 4), not label:manage -- same ownership check as `update`. */
  async setLabels(task: TaskEntity, role: Role, actorId: string, organizationId: string, labelIds: string[]): Promise<TaskEntity> {
    if (!canActOnResource(role, 'task:update:any', 'task:update:own', isOwnTask(task, actorId))) {
      throw new ForbiddenError('Missing permission: task:update:own or task:update:any');
    }

    await labelsService.setTaskLabels(organizationId, task.id, actorId, labelIds);
    const updated = await tasksRepository.findById(task.id, task.projectId);
    if (!updated) {
      throw new ConflictError('Task was deleted while its labels were being updated');
    }
    return updated;
  },
};
