import type { Prisma } from '@prisma/client';

import { prisma, type DbClient } from '../../shared/db/index.js';
import type { RecordActivityInput, TaskActivityActor, TaskActivityEntity, TaskActivityType } from './activity.types.js';

type TaskActivityRow = {
  id: string;
  taskId: string;
  actorId: string | null;
  apiKeyActorId: string | null;
  type: string;
  changes: unknown;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
  apiKeyActor: { id: string; name: string; prefix: string } | null;
};

const ACTOR_INCLUDE = {
  actor: { select: { id: true, name: true, email: true } },
  apiKeyActor: { select: { id: true, name: true, prefix: true } },
} satisfies Prisma.TaskActivityInclude;

function toActor(row: TaskActivityRow): TaskActivityActor {
  if (row.actor) {
    return { type: 'USER', id: row.actor.id, name: row.actor.name, email: row.actor.email };
  }
  if (row.apiKeyActor) {
    return { type: 'API_KEY', id: row.apiKeyActor.id, name: row.apiKeyActor.name, prefix: row.apiKeyActor.prefix };
  }
  // Unreachable given the database CHECK constraint (see the migration), but
  // TypeScript can't know that from a nullable-nullable pair.
  throw new Error(`TaskActivity ${row.id} has neither a user nor an API key actor`);
}

function toEntity(row: TaskActivityRow): TaskActivityEntity {
  return {
    id: row.id,
    taskId: row.taskId,
    actor: toActor(row),
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
    if ((input.actorId ? 1 : 0) + (input.apiKeyActorId ? 1 : 0) !== 1) {
      throw new Error('activityRepository.record requires exactly one of actorId / apiKeyActorId');
    }
    await client.taskActivity.create({
      data: {
        taskId: input.taskId,
        actorId: input.actorId,
        apiKeyActorId: input.apiKeyActorId,
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
      include: ACTOR_INCLUDE,
    });
    return rows.map(toEntity);
  },
};
