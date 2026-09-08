import type { Prisma } from '@prisma/client';

import { prisma, type DbClient } from '../../shared/db/index.js';
import type { RecordActivityInput, TaskActivityEntity, TaskActivityType } from './activity.types.js';

function toEntity(row: {
  id: string;
  taskId: string;
  actorId: string;
  type: string;
  changes: unknown;
  createdAt: Date;
}): TaskActivityEntity {
  return {
    id: row.id,
    taskId: row.taskId,
    actorId: row.actorId,
    type: row.type as TaskActivityType,
    changes: row.changes as { before: unknown; after: unknown },
    createdAt: row.createdAt,
  };
}

export const activityRepository = {
  /**
   * `client` is always the transaction handle of the operation this entry
   * describes (see activity.service.ts) -- never called against the bare
   * `prisma` client, so an entry can never outlive the change it records.
   */
  async record(input: RecordActivityInput, client: DbClient): Promise<void> {
    await client.taskActivity.create({
      data: {
        taskId: input.taskId,
        actorId: input.actorId,
        type: input.type,
        // `before`/`after` come from callers across the codebase as plain
        // JS values (strings, numbers, null, small objects) that are always
        // JSON-serializable; Prisma's InputJsonValue type just doesn't
        // widen from `unknown`.
        changes: { before: input.before, after: input.after } as Prisma.InputJsonValue,
      },
    });
  },

  async listForTask(
    taskId: string,
    cursorId: string | undefined,
    limit: number,
    client: DbClient = prisma,
  ): Promise<TaskActivityEntity[]> {
    const rows = await client.taskActivity.findMany({
      where: { taskId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      take: limit + 1,
    });
    return rows.map(toEntity);
  },
};
