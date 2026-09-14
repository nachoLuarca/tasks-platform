import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { taskActivityListQuerySchema, taskActivityListResponseSchema } from '@tasks-platform/contracts';

import { jsonResponse, registerOperation } from '../../shared/openapi/index.js';

export function registerActivityPaths(registry: OpenAPIRegistry): void {
  registerOperation(registry, {
    operationId: 'listTaskActivity',
    method: 'get',
    path: '/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/activity',
    tag: 'activity',
    summary: 'Ver la bitacora de una tarea',
    description:
      'Paginada por cursor, la entrada mas reciente primero. Cada entrada trae el valor anterior y el nuevo, y su actor: un usuario o una API key. No hay endpoint de escritura.',
    auth: 'bearer',
    permission: 'task:read',
    query: taskActivityListQuerySchema,
    responses: { 200: jsonResponse('Una pagina de la bitacora.', taskActivityListResponseSchema) },
    errors: { 404: 'La organizacion, el proyecto o la tarea no existen, o la tarea esta borrada.' },
  });
}
