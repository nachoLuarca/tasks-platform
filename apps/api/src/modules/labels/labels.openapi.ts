import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  createLabelRequestSchema,
  labelListQuerySchema,
  labelListResponseSchema,
  labelResponseSchema,
  updateLabelRequestSchema,
} from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

const BASE = '/v1/organizations/:organizationId/labels';
const LABEL_NOT_FOUND = 'La organizacion o la etiqueta no existen, o quien llama no es miembro.';
const DUPLICATE_NAME = 'Ya existe una etiqueta con ese nombre en la organizacion.';

export function registerLabelsPaths(registry: OpenAPIRegistry): void {
  const Label = labelResponseSchema.openapi('Label');

  registerOperation(registry, {
    operationId: 'createLabel',
    method: 'post',
    path: BASE,
    tag: 'labels',
    summary: 'Crear una etiqueta',
    auth: 'bearer',
    permission: 'label:manage',
    body: createLabelRequestSchema.openapi('CreateLabelRequest'),
    responses: { 201: jsonResponse('Etiqueta creada.', Label) },
    errors: { 409: DUPLICATE_NAME },
  });

  registerOperation(registry, {
    operationId: 'listLabels',
    method: 'get',
    path: BASE,
    tag: 'labels',
    summary: 'Listar etiquetas',
    auth: 'bearer',
    permission: 'task:read',
    query: labelListQuerySchema,
    responses: { 200: jsonResponse('Una pagina de etiquetas.', labelListResponseSchema) },
  });

  registerOperation(registry, {
    operationId: 'updateLabel',
    method: 'patch',
    path: `${BASE}/:labelId`,
    tag: 'labels',
    summary: 'Renombrar o recolorear una etiqueta',
    auth: 'bearer',
    permission: 'label:manage',
    body: updateLabelRequestSchema.openapi('UpdateLabelRequest'),
    responses: { 200: jsonResponse('Etiqueta actualizada.', Label) },
    errors: { 404: LABEL_NOT_FOUND, 409: DUPLICATE_NAME },
  });

  registerOperation(registry, {
    operationId: 'deleteLabel',
    method: 'delete',
    path: `${BASE}/:labelId`,
    tag: 'labels',
    summary: 'Borrar una etiqueta',
    description: 'La desvincula de sus tareas, sin borrar las tareas.',
    auth: 'bearer',
    permission: 'label:manage',
    responses: { 204: emptyResponse('Etiqueta borrada.') },
    errors: { 404: LABEL_NOT_FOUND },
  });
}
