import type { WebhookDeliveryResponse, WebhookEndpointResponse, WebhookEndpointWithSecretResponse } from '@tasks-platform/contracts';

import type { WebhookDeliveryEntity, WebhookEndpointEntity } from './webhooks.types.js';

export function toWebhookEndpointResponse(endpoint: WebhookEndpointEntity): WebhookEndpointResponse {
  return {
    id: endpoint.id,
    organizationId: endpoint.organizationId,
    url: endpoint.url,
    eventTypes: endpoint.eventTypes,
    enabled: endpoint.enabled,
    disabledReason: endpoint.disabledReason,
    consecutiveFailures: endpoint.consecutiveFailures,
    createdById: endpoint.createdById,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

/** Only called right after create/rotate -- see webhooks.controller.ts. */
export function toWebhookEndpointWithSecretResponse(endpoint: WebhookEndpointEntity, secret: string): WebhookEndpointWithSecretResponse {
  return { ...toWebhookEndpointResponse(endpoint), secret };
}

export function toWebhookDeliveryResponse(delivery: WebhookDeliveryEntity): WebhookDeliveryResponse {
  return {
    id: delivery.id,
    endpointId: delivery.endpointId,
    outboxEventId: delivery.outboxEventId,
    attempt: delivery.attempt,
    statusCode: delivery.statusCode,
    responseSnippet: delivery.responseSnippet,
    error: delivery.error,
    durationMs: delivery.durationMs,
    createdAt: delivery.createdAt.toISOString(),
  };
}
