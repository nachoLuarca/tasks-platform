import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  createProjectRequestSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectResponseSchema,
  updateProjectRequestSchema,
} from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

const BASE = '/v1/organizations/:organizationId/projects';
const PROJECT_NOT_FOUND = 'La organizacion o el proyecto no existen, el proyecto es de otra organizacion o esta borrado.';

export function registerProjectsPaths(registry: OpenAPIRegistry): void {
  const Project = projectResponseSchema.openapi('Project');

  registerOperation(registry, {
    operationId: 'createProject',
    method: 'post',
    path: BASE,
    tag: 'projects',
    summary: 'Crear un proyecto',
    auth: 'bearer',
    permission: 'project:create',
    body: createProjectRequestSchema.openapi('CreateProjectRequest'),
    responses: { 201: jsonResponse('Proyecto creado.', Project) },
    errors: { 409: 'Ya existe un proyecto con esa `key` en la organizacion.' },
  });

  registerOperation(registry, {
    operationId: 'listProjects',
    method: 'get',
    path: BASE,
    tag: 'projects',
    summary: 'Listar proyectos',
    description: 'Paginado por cursor: se reenvia `nextCursor` tal cual para pedir la pagina siguiente.',
    auth: 'bearer',
    permission: 'project:read',
    query: projectListQuerySchema,
    responses: { 200: jsonResponse('Una pagina de proyectos.', projectListResponseSchema) },
  });

  registerOperation(registry, {
    operationId: 'getProject',
    method: 'get',
    path: `${BASE}/:projectId`,
    tag: 'projects',
    summary: 'Ver un proyecto',
    auth: 'bearer',
    permission: 'project:read',
    responses: { 200: jsonResponse('El proyecto.', Project) },
    errors: { 404: PROJECT_NOT_FOUND },
  });

  registerOperation(registry, {
    operationId: 'updateProject',
    method: 'patch',
    path: `${BASE}/:projectId`,
    tag: 'projects',
    summary: 'Editar un proyecto',
    auth: 'bearer',
    permission: 'project:update',
    body: updateProjectRequestSchema.openapi('UpdateProjectRequest'),
    responses: { 200: jsonResponse('Proyecto actualizado.', Project) },
    errors: { 404: PROJECT_NOT_FOUND },
  });

  registerOperation(registry, {
    operationId: 'deleteProject',
    method: 'delete',
    path: `${BASE}/:projectId`,
    tag: 'projects',
    summary: 'Borrar un proyecto',
    description: 'Borrado logico: sus tareas dejan de listarse.',
    auth: 'bearer',
    permission: 'project:delete',
    responses: { 204: emptyResponse('Proyecto borrado.') },
    errors: { 404: PROJECT_NOT_FOUND },
  });

  registerOperation(registry, {
    operationId: 'archiveProject',
    method: 'post',
    path: `${BASE}/:projectId/archive`,
    tag: 'projects',
    summary: 'Archivar un proyecto',
    auth: 'bearer',
    permission: 'project:update',
    responses: { 200: jsonResponse('Proyecto archivado.', Project) },
    errors: { 404: PROJECT_NOT_FOUND, 409: 'El proyecto ya esta archivado.' },
  });

  registerOperation(registry, {
    operationId: 'unarchiveProject',
    method: 'post',
    path: `${BASE}/:projectId/unarchive`,
    tag: 'projects',
    summary: 'Reactivar un proyecto archivado',
    auth: 'bearer',
    permission: 'project:update',
    responses: { 200: jsonResponse('Proyecto activo otra vez.', Project) },
    errors: { 404: PROJECT_NOT_FOUND, 409: 'El proyecto ya esta activo.' },
  });
}
