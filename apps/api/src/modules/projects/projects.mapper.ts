import type { ProjectResponse } from '@tasks-platform/contracts';

import type { ProjectEntity } from './projects.types.js';

export function toProjectResponse(project: ProjectEntity): ProjectResponse {
  return {
    id: project.id,
    organizationId: project.organizationId,
    key: project.key,
    name: project.name,
    description: project.description,
    status: project.status,
    taskCounter: project.taskCounter,
    createdById: project.createdById,
    createdByApiKeyId: project.createdByApiKeyId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
