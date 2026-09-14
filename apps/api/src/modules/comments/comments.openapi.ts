import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  commentListQuerySchema,
  commentListResponseSchema,
  commentResponseSchema,
  createCommentRequestSchema,
  updateCommentRequestSchema,
} from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

const BASE = '/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments';
const COMMENT_NOT_FOUND = 'La organizacion, el proyecto, la tarea o el comentario no existen.';

export function registerCommentsPaths(registry: OpenAPIRegistry): void {
  const Comment = commentResponseSchema.openapi('Comment');

  registerOperation(registry, {
    operationId: 'createComment',
    method: 'post',
    path: BASE,
    tag: 'comments',
    summary: 'Comentar una tarea',
    auth: 'bearer',
    permission: 'comment:create',
    body: createCommentRequestSchema.openapi('CreateCommentRequest'),
    responses: { 201: jsonResponse('Comentario creado.', Comment) },
  });

  registerOperation(registry, {
    operationId: 'listComments',
    method: 'get',
    path: BASE,
    tag: 'comments',
    summary: 'Listar los comentarios de una tarea',
    description: 'Paginado por cursor, en orden cronologico.',
    auth: 'bearer',
    permission: 'task:read',
    query: commentListQuerySchema,
    responses: { 200: jsonResponse('Una pagina de comentarios.', commentListResponseSchema) },
  });

  registerOperation(registry, {
    operationId: 'updateComment',
    method: 'patch',
    path: `${BASE}/:commentId`,
    tag: 'comments',
    summary: 'Editar un comentario',
    description: 'Solo su autor puede editarlo.',
    auth: 'bearer',
    permission: 'comment:update:own',
    usersOnly: true,
    body: updateCommentRequestSchema.openapi('UpdateCommentRequest'),
    responses: { 200: jsonResponse('Comentario actualizado, con `editedAt`.', Comment) },
    errors: {
      403: 'Falta `comment:update:own`, quien llama no es el autor, o la credencial es una API key.',
      404: COMMENT_NOT_FOUND,
    },
  });

  registerOperation(registry, {
    operationId: 'deleteComment',
    method: 'delete',
    path: `${BASE}/:commentId`,
    tag: 'comments',
    summary: 'Borrar un comentario',
    description: 'Su autor con `comment:delete:own`, o cualquiera con `comment:delete:any`.',
    auth: 'bearer',
    responses: { 204: emptyResponse('Comentario borrado.') },
    errors: {
      403: 'Sin `comment:delete:own` siendo el autor, ni `comment:delete:any`.',
      404: COMMENT_NOT_FOUND,
    },
  });
}
