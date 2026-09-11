import type { TaskResponse } from '@tasks-platform/contracts';

import type { TaskEntity } from './tasks.types.js';

export function toTaskResponse(task: TaskEntity): TaskResponse {
  return {
    id: task.id,
    projectId: task.projectId,
    number: task.number,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId,
    assignee: task.assignee,
    createdById: task.createdById,
    createdByApiKeyId: task.createdByApiKeyId,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    version: task.version,
    labels: task.labels,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
