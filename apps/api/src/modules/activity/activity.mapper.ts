import type { TaskActivityResponse } from '@tasks-platform/contracts';

import type { TaskActivityEntity } from './activity.types.js';

export function toTaskActivityResponse(entry: TaskActivityEntity): TaskActivityResponse {
  return {
    id: entry.id,
    taskId: entry.taskId,
    actorId: entry.actorId,
    type: entry.type,
    changes: entry.changes,
    createdAt: entry.createdAt.toISOString(),
  };
}
