import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  assignTaskRequestSchema,
  createTaskRequestSchema,
  setTaskLabelsRequestSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskResponseSchema,
  updateTaskRequestSchema,
} from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

const BASE = '/v1/organizations/:organizationId/projects/:projectId/tasks';
const TASK_NOT_FOUND = 'La organizacion, el proyecto o la tarea no existen, o la tarea esta borrada.';
const LIST_FILTERS = '`unassigned=true` y `assigneeId` son excluyentes: si llegan los dos, gana `assigneeId`.';

export function registerTasksPaths(registry: OpenAPIRegistry): void {
  const Task = taskResponseSchema.openapi('Task');

  registerOperation(registry, {
    operationId: 'createTask',
    method: 'post',
    path: BASE,
    tag: 'tasks',
    summary: 'Crear una tarea',
    description: 'La tarea recibe el siguiente numero correlativo del proyecto.',
    auth: 'bearer',
    permission: 'task:create',
    body: createTaskRequestSchema.openapi('CreateTaskRequest'),
    responses: { 201: jsonResponse('Tarea creada.', Task) },
    errors: { 422: 'El responsable indicado no es miembro de la organizacion.' },
  });

  registerOperation(registry, {
    operationId: 'listProjectTasks',
    method: 'get',
    path: BASE,
    tag: 'tasks',
    summary: 'Listar las tareas de un proyecto',
    description: `Paginado por cursor, con filtros y orden. ${LIST_FILTERS}`,
    auth: 'bearer',
    permission: 'task:read',
    query: taskListQuerySchema,
    responses: { 200: jsonResponse('Una pagina de tareas.', taskListResponseSchema) },
  });

  registerOperation(registry, {
    operationId: 'getTask',
    method: 'get',
    path: `${BASE}/:taskId`,
    tag: 'tasks',
    summary: 'Ver una tarea',
    auth: 'bearer',
    permission: 'task:read',
    responses: { 200: jsonResponse('La tarea.', Task) },
    errors: { 404: TASK_NOT_FOUND },
  });

  registerOperation(registry, {
    operationId: 'updateTask',
    method: 'patch',
    path: `${BASE}/:taskId`,
    tag: 'tasks',
    summary: 'Editar una tarea',
    description:
      'Exige la `version` leida (bloqueo optimista, ADR 0007). Puede editarla su creador o responsable con `task:update:own`, o cualquiera con `task:update:any`.',
    auth: 'bearer',
    body: updateTaskRequestSchema.openapi('UpdateTaskRequest'),
    responses: { 200: jsonResponse('Tarea actualizada, con la `version` nueva.', Task) },
    errors: {
      403: 'Sin `task:update:own` sobre esta tarea ni `task:update:any`.',
      404: TASK_NOT_FOUND,
      409: 'La `version` no coincide: alguien modifico la tarea; hay que releerla y reintentar.',
    },
  });

  registerOperation(registry, {
    operationId: 'deleteTask',
    method: 'delete',
    path: `${BASE}/:taskId`,
    tag: 'tasks',
    summary: 'Borrar una tarea',
    description: 'Borrado logico. Puede borrarla su creador o responsable con `task:delete:own`, o cualquiera con `task:delete:any`.',
    auth: 'bearer',
    responses: { 204: emptyResponse('Tarea borrada.') },
    errors: { 403: 'Sin `task:delete:own` sobre esta tarea ni `task:delete:any`.', 404: TASK_NOT_FOUND },
  });

  registerOperation(registry, {
    operationId: 'assignTask',
    method: 'post',
    path: `${BASE}/:taskId/assign`,
    tag: 'tasks',
    summary: 'Asignar una tarea',
    description: '`task:assign` permite asignar a cualquier miembro; `task:assign:self` solo permite asignarsela a uno mismo.',
    auth: 'bearer',
    body: assignTaskRequestSchema.openapi('AssignTaskRequest'),
    responses: { 200: jsonResponse('Tarea asignada.', Task) },
    errors: {
      403: 'Sin `task:assign`, o con `task:assign:self` intentando asignar a otra persona.',
      404: TASK_NOT_FOUND,
      409: 'La tarea ya tiene responsable.',
      422: 'El usuario indicado no es miembro de la organizacion.',
    },
  });

  registerOperation(registry, {
    operationId: 'unassignTask',
    method: 'post',
    path: `${BASE}/:taskId/unassign`,
    tag: 'tasks',
    summary: 'Quitar el responsable de una tarea',
    auth: 'bearer',
    responses: { 200: jsonResponse('Tarea sin responsable.', Task) },
    errors: {
      403: 'Sin `task:assign`, o con `task:assign:self` intentando quitar a otra persona.',
      404: TASK_NOT_FOUND,
    },
  });

  registerOperation(registry, {
    operationId: 'setTaskLabels',
    method: 'put',
    path: `${BASE}/:taskId/labels`,
    tag: 'tasks',
    summary: 'Fijar las etiquetas de una tarea',
    description: 'Reemplaza el conjunto completo. Se rige por los mismos permisos que editar la tarea.',
    auth: 'bearer',
    body: setTaskLabelsRequestSchema.openapi('SetTaskLabelsRequest'),
    responses: { 200: jsonResponse('Tarea con sus etiquetas nuevas.', Task) },
    errors: {
      403: 'Sin `task:update:own` sobre esta tarea ni `task:update:any`.',
      404: TASK_NOT_FOUND,
      409: 'La tarea se borro mientras se actualizaban sus etiquetas.',
      422: 'Alguna etiqueta no pertenece a la organizacion.',
    },
  });

  registerOperation(registry, {
    operationId: 'listTasksAssignedToMe',
    method: 'get',
    path: '/v1/organizations/:organizationId/tasks',
    tag: 'tasks',
    summary: 'Listar mis tareas asignadas',
    description: `Tareas asignadas a quien llama en todos los proyectos de la organizacion. ${LIST_FILTERS}`,
    auth: 'bearer',
    permission: 'task:read',
    usersOnly: true,
    query: taskListQuerySchema,
    responses: { 200: jsonResponse('Una pagina de tareas.', taskListResponseSchema) },
  });
}
