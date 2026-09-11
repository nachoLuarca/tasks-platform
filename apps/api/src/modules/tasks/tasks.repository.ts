import type { Prisma } from '@prisma/client';
import type { TaskPriority, TaskStatus } from '@tasks-platform/contracts';

import { prisma, type DbClient } from '../../shared/db/index.js';
import type {
  CreateTaskInput,
  TaskEntity,
  TaskListFilter,
  TaskSortBy,
  TaskSortOrder,
  UpdateTaskInput,
} from './tasks.types.js';

type TaskRow = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  createdById: string | null;
  createdByApiKeyId: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  assignee: { id: string; name: string; email: string } | null;
  taskLabels: { label: { id: string; name: string; color: string } }[];
};

const ASSIGNEE_SELECT = { select: { id: true, name: true, email: true } };
const TASK_INCLUDE = {
  assignee: ASSIGNEE_SELECT,
  taskLabels: { include: { label: { select: { id: true, name: true, color: true } } } },
};

function toEntity(row: TaskRow): TaskEntity {
  return {
    ...row,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assignee: row.assignee,
    labels: row.taskLabels.map(({ label }) => label),
  };
}

function buildFilterWhere(filter: TaskListFilter): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};
  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.priority) {
    where.priority = filter.priority;
  }
  if (filter.assigneeId) {
    where.assigneeId = filter.assigneeId;
  } else if (filter.unassigned) {
    where.assigneeId = null;
  }
  if (filter.dueBefore || filter.dueAfter) {
    where.dueDate = {
      ...(filter.dueBefore ? { lt: filter.dueBefore } : {}),
      ...(filter.dueAfter ? { gt: filter.dueAfter } : {}),
    };
  }
  if (filter.search) {
    where.title = { contains: filter.search, mode: 'insensitive' };
  }
  if (filter.labelId) {
    where.taskLabels = { some: { labelId: filter.labelId } };
  }
  return where;
}

export const tasksRepository = {
  /**
   * Claims the next task number for the project and creates the task with
   * it. Always called by tasksService.create from inside its own
   * `prisma.$transaction` (so the TASK_CREATED activity entry lands in the
   * same transaction, see tasks.service.ts) -- `client` must be that
   * transaction's handle, not the bare `prisma` client. `UPDATE ...
   * SET "taskCounter" = "taskCounter" + 1 ... RETURNING` takes a row lock on
   * the project for the rest of the transaction: a second, concurrent call
   * for the same project blocks on that UPDATE until the first transaction
   * commits (or rolls back), so two calls can never read the same counter
   * value and hand out the same number. This is why the increment and the
   * read happen as a single statement instead of a separate SELECT followed
   * by an UPDATE.
   */
  async createWithNextNumber(input: CreateTaskInput, client: DbClient): Promise<TaskEntity> {
    const claimed = await client.$queryRaw<{ taskCounter: number }[]>`
      UPDATE "Project" SET "taskCounter" = "taskCounter" + 1 WHERE id = ${input.projectId} RETURNING "taskCounter"
    `;
    const number = claimed[0]?.taskCounter;
    if (number === undefined) {
      throw new Error(`Cannot claim a task number: project ${input.projectId} does not exist`);
    }

    const row = await client.task.create({
      data: {
        projectId: input.projectId,
        number,
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeId: input.assigneeId,
        dueDate: input.dueDate,
        createdById: input.createdById,
        createdByApiKeyId: input.createdByApiKeyId,
      },
      include: TASK_INCLUDE,
    });
    return toEntity(row);
  },

  async findById(id: string, projectId: string, client: DbClient = prisma): Promise<TaskEntity | null> {
    const row = await client.task.findFirst({
      where: { id, projectId, deletedAt: null },
      include: TASK_INCLUDE,
    });
    return row ? toEntity(row) : null;
  },

  async list(
    projectId: string,
    filter: TaskListFilter,
    sortBy: TaskSortBy,
    sortOrder: TaskSortOrder,
    cursorId: string | undefined,
    limit: number,
    client: DbClient = prisma,
  ): Promise<TaskEntity[]> {
    const rows = await client.task.findMany({
      where: { projectId, deletedAt: null, ...buildFilterWhere(filter) },
      orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      take: limit + 1,
      include: TASK_INCLUDE,
    });
    return rows.map(toEntity);
  },

  /** Tasks assigned to `userId`, across every non-deleted project in the organization. */
  async listAssignedToUser(
    organizationId: string,
    userId: string,
    filter: Omit<TaskListFilter, 'assigneeId' | 'unassigned'>,
    sortBy: TaskSortBy,
    sortOrder: TaskSortOrder,
    cursorId: string | undefined,
    limit: number,
    client: DbClient = prisma,
  ): Promise<TaskEntity[]> {
    const rows = await client.task.findMany({
      where: {
        assigneeId: userId,
        deletedAt: null,
        project: { organizationId, deletedAt: null },
        ...buildFilterWhere(filter),
      },
      orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      take: limit + 1,
      include: TASK_INCLUDE,
    });
    return rows.map(toEntity);
  },

  /**
   * Optimistic-locking update: the WHERE clause requires the version the
   * caller read to still be current, and the whole check-and-increment
   * happens as a single UPDATE statement, so no other transaction can slip
   * in between the check and the write. Returns `null` if the row didn't
   * match (either the version is stale, or the task no longer exists), which
   * the service turns into a 409 -- see tasks.service.ts for why that 409 is
   * also the mechanism that proves activity entries never survive a rolled
   * back update.
   */
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    input: UpdateTaskInput,
    client: DbClient = prisma,
  ): Promise<TaskEntity | null> {
    const result = await client.task.updateMany({
      where: { id, version: expectedVersion },
      data: { ...input, version: { increment: 1 } },
    });
    if (result.count === 0) {
      return null;
    }
    const row = await client.task.findUniqueOrThrow({
      where: { id },
      include: TASK_INCLUDE,
    });
    return toEntity(row);
  },

  async assign(id: string, assigneeId: string | null, client: DbClient = prisma): Promise<TaskEntity> {
    const row = await client.task.update({
      where: { id },
      data: { assigneeId, version: { increment: 1 } },
      include: TASK_INCLUDE,
    });
    return toEntity(row);
  },

  async softDelete(id: string, client: DbClient = prisma): Promise<void> {
    await client.task.update({ where: { id }, data: { deletedAt: new Date() } });
  },
};
