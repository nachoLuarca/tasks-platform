import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  createWebhookEndpointRequestSchema,
  updateWebhookEndpointRequestSchema,
  webhookDeliveryListQuerySchema,
  webhookDeliveryListResponseSchema,
  webhookEndpointListResponseSchema,
  webhookEndpointResponseSchema,
  webhookEndpointWithSecretResponseSchema,
} from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

const BASE = '/v1/organizations/:organizationId/webhooks';
const WEBHOOK_NOT_FOUND = 'La organizacion o el webhook no existen, o quien llama no es miembro.';

export function registerWebhooksPaths(registry: OpenAPIRegistry): void {
  const WebhookEndpoint = webhookEndpointResponseSchema.openapi('WebhookEndpoint');
  const WebhookEndpointWithSecret = webhookEndpointWithSecretResponseSchema.openapi('WebhookEndpointWithSecret');

  registerOperation(registry, {
    operationId: 'createWebhook',
    method: 'post',
    path: BASE,
    tag: 'webhooks',
    summary: 'Crear un webhook',
    description: 'La respuesta trae el `secret` de firma. Es la unica vez que aparece, junto con la rotacion (ADR 0010).',
    auth: 'bearer',
    permission: 'webhook:manage',
    usersOnly: true,
    body: createWebhookEndpointRequestSchema.openapi('CreateWebhookEndpointRequest'),
    responses: { 201: jsonResponse('Webhook creado, con su secreto.', WebhookEndpointWithSecret) },
  });

  registerOperation(registry, {
    operationId: 'listWebhooks',
    method: 'get',
    path: BASE,
    tag: 'webhooks',
    summary: 'Listar webhooks',
    auth: 'bearer',
    permission: 'webhook:manage',
    responses: { 200: jsonResponse('Webhooks de la organizacion, sin el secreto.', webhookEndpointListResponseSchema) },
  });

  registerOperation(registry, {
    operationId: 'updateWebhook',
    method: 'patch',
    path: `${BASE}/:webhookId`,
    tag: 'webhooks',
    summary: 'Editar un webhook',
    description: 'Cambia la url, los eventos suscriptos o `enabled`.',
    auth: 'bearer',
    permission: 'webhook:manage',
    body: updateWebhookEndpointRequestSchema.openapi('UpdateWebhookEndpointRequest'),
    responses: { 200: jsonResponse('Webhook actualizado.', WebhookEndpoint) },
    errors: { 404: WEBHOOK_NOT_FOUND },
  });

  registerOperation(registry, {
    operationId: 'deleteWebhook',
    method: 'delete',
    path: `${BASE}/:webhookId`,
    tag: 'webhooks',
    summary: 'Borrar un webhook',
    auth: 'bearer',
    permission: 'webhook:manage',
    responses: { 204: emptyResponse('Webhook borrado, con su historial de entregas.') },
    errors: { 404: WEBHOOK_NOT_FOUND },
  });

  registerOperation(registry, {
    operationId: 'rotateWebhookSecret',
    method: 'post',
    path: `${BASE}/:webhookId/rotate-secret`,
    tag: 'webhooks',
    summary: 'Rotar el secreto de un webhook',
    description: 'Genera un secreto de firma nuevo, que solo aparece en esta respuesta.',
    auth: 'bearer',
    permission: 'webhook:manage',
    responses: { 200: jsonResponse('Webhook con su secreto nuevo.', WebhookEndpointWithSecret) },
    errors: { 404: WEBHOOK_NOT_FOUND },
  });

  registerOperation(registry, {
    operationId: 'sendWebhookTest',
    method: 'post',
    path: `${BASE}/:webhookId/test`,
    tag: 'webhooks',
    summary: 'Enviar un evento de prueba',
    description: 'Pasa por el mismo pipeline real (outbox, cola, firma, reintentos) que cualquier evento.',
    auth: 'bearer',
    permission: 'webhook:manage',
    responses: { 202: emptyResponse('Evento de prueba encolado.') },
    errors: { 404: WEBHOOK_NOT_FOUND },
  });

  registerOperation(registry, {
    operationId: 'listWebhookDeliveries',
    method: 'get',
    path: `${BASE}/:webhookId/deliveries`,
    tag: 'webhooks',
    summary: 'Ver el historial de entregas',
    description: 'Paginado por cursor. Un intento por fila, con codigo de estado, fragmento de la respuesta o error, y duracion.',
    auth: 'bearer',
    permission: 'webhook:manage',
    query: webhookDeliveryListQuerySchema,
    responses: { 200: jsonResponse('Una pagina de entregas.', webhookDeliveryListResponseSchema) },
    errors: { 404: WEBHOOK_NOT_FOUND },
  });
}
