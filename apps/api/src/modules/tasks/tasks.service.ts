import type { Role, TaskListQuery, TaskPriority } from '@tasks-platform/contracts';

import { canActOnResource } from '../../shared/authorization/index.js';
import { ConflictError, ForbiddenError, UnprocessableEntityError } from '../../shared/errors/index.js';
import { buildPage, decodeCursor, type Page } from '../../shared/pagination/index.js';
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
  };
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
    return tasksRepository.createWithNextNumber(createInput);
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
   * mismatch.
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

    const updated = await tasksRepository.updateWithVersion(task.id, input.version, patch);
    if (!updated) {
      throw new ConflictError('Task was modified by someone else; reload and try again');
    }
    return updated;
  },

  async remove(task: TaskEntity, role: Role, actorId: string): Promise<void> {
    if (!canActOnResource(role, 'task:delete:any', 'task:delete:own', isOwnTask(task, actorId))) {
      throw new ForbiddenError('Missing permission: task:delete:own or task:delete:any');
    }
    await tasksRepository.softDelete(task.id);
  },

  async assign(task: TaskEntity, organizationId: string, assigneeId: string): Promise<TaskEntity> {
    await assertAssigneeIsMember(organizationId, assigneeId);
    return tasksRepository.assign(task.id, assigneeId);
  },

  async unassign(task: TaskEntity): Promise<TaskEntity> {
    return tasksRepository.assign(task.id, null);
  },
};
