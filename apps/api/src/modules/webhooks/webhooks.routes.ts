import { Router } from 'express';

import { createWebhookEndpointRequestSchema, updateWebhookEndpointRequestSchema, webhookDeliveryListQuerySchema } from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateBody, validateQuery } from '../../shared/http/index.js';
import { requireWebhook } from './require-webhook.middleware.js';
import { webhooksController } from './webhooks.controller.js';

/** Mounted at /v1/organizations/:organizationId/webhooks, behind requireMembership. Every route needs `webhook:manage` (ADMIN/OWNER only) -- see permissions.ts. */
export const webhooksRouter = Router({ mergeParams: true });

webhooksRouter.post('/', requirePermission('webhook:manage'), validateBody(createWebhookEndpointRequestSchema), webhooksController.create);
webhooksRouter.get('/', requirePermission('webhook:manage'), webhooksController.list);

webhooksRouter.patch(
  '/:webhookId',
  requirePermission('webhook:manage'),
  requireWebhook,
  validateBody(updateWebhookEndpointRequestSchema),
  webhooksController.update,
);
webhooksRouter.delete('/:webhookId', requirePermission('webhook:manage'), requireWebhook, webhooksController.remove);
webhooksRouter.post('/:webhookId/rotate-secret', requirePermission('webhook:manage'), requireWebhook, webhooksController.rotateSecret);
webhooksRouter.post('/:webhookId/test', requirePermission('webhook:manage'), requireWebhook, webhooksController.sendTest);
webhooksRouter.get(
  '/:webhookId/deliveries',
  requirePermission('webhook:manage'),
  requireWebhook,
  validateQuery(webhookDeliveryListQuerySchema),
  webhooksController.listDeliveries,
);
