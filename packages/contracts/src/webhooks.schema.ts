import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './pagination.schema.js';
import { taskActivityTypeSchema } from './activity.schema.js';

/** A webhook subscribes to a subset of the same event catalog the activity log tracks -- see activity.schema.ts's taskActivityTypeSchema and docs/adr/0009-outbox-pattern.md. */
export const createWebhookEndpointRequestSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(taskActivityTypeSchema).min(1, 'At least one event type is required'),
});
export type CreateWebhookEndpointRequest = z.infer<typeof createWebhookEndpointRequestSchema>;

export const updateWebhookEndpointRequestSchema = z
  .object({
    url: z.string().url().optional(),
    eventTypes: z.array(taskActivityTypeSchema).min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateWebhookEndpointRequest = z.infer<typeof updateWebhookEndpointRequestSchema>;

export const webhookEndpointResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  url: z.string(),
  eventTypes: z.array(taskActivityTypeSchema),
  enabled: z.boolean(),
  disabledReason: z.string().nullable(),
  consecutiveFailures: z.number().int(),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WebhookEndpointResponse = z.infer<typeof webhookEndpointResponseSchema>;

/** Only the create and rotate-secret responses carry the secret -- never shown again after that (PHASE.md decision 4). */
export const webhookEndpointWithSecretResponseSchema = webhookEndpointResponseSchema.extend({ secret: z.string() });
export type WebhookEndpointWithSecretResponse = z.infer<typeof webhookEndpointWithSecretResponseSchema>;

export const webhookEndpointListResponseSchema = z.array(webhookEndpointResponseSchema);
export type WebhookEndpointListResponse = z.infer<typeof webhookEndpointListResponseSchema>;

export const webhookDeliveryResponseSchema = z.object({
  id: z.string().uuid(),
  endpointId: z.string().uuid(),
  outboxEventId: z.string().uuid(),
  attempt: z.number().int(),
  statusCode: z.number().int().nullable(),
  responseSnippet: z.string().nullable(),
  error: z.string().nullable(),
  durationMs: z.number().int(),
  createdAt: z.string().datetime(),
});
export type WebhookDeliveryResponse = z.infer<typeof webhookDeliveryResponseSchema>;

export const webhookDeliveryListQuerySchema = paginationQuerySchema;
export type WebhookDeliveryListQuery = z.infer<typeof webhookDeliveryListQuerySchema>;

export const webhookDeliveryListResponseSchema = paginatedResponseSchema(webhookDeliveryResponseSchema);
export type WebhookDeliveryListResponse = z.infer<typeof webhookDeliveryListResponseSchema>;
