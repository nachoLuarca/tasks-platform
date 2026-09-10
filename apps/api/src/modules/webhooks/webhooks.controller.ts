import type { RequestHandler } from 'express';

import type { CreateWebhookEndpointRequest, UpdateWebhookEndpointRequest, WebhookDeliveryListQuery } from '@tasks-platform/contracts';

import { requireUserId } from '../../shared/authorization/index.js';
import { UnauthorizedError } from '../../shared/errors/index.js';
import { toWebhookDeliveryResponse, toWebhookEndpointResponse, toWebhookEndpointWithSecretResponse } from './webhooks.mapper.js';
import { webhooksService } from './webhooks.service.js';
import type { WebhookEndpointEntity } from './webhooks.types.js';

function getOrganizationId(req: { membership?: { organizationId: string } }): string {
  if (!req.membership) {
    throw new UnauthorizedError('Missing membership context');
  }
  return req.membership.organizationId;
}

function getWebhook(req: { webhook?: WebhookEndpointEntity }): WebhookEndpointEntity {
  if (!req.webhook) {
    throw new UnauthorizedError('Missing webhook context');
  }
  return req.webhook;
}

export const webhooksController = {
  create: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const createdById = requireUserId(req);
    const body = req.body as CreateWebhookEndpointRequest;

    const { endpoint, secret } = await webhooksService.create(organizationId, createdById, body.url, body.eventTypes);
    res.status(201).json(toWebhookEndpointWithSecretResponse(endpoint, secret));
  }) satisfies RequestHandler,

  list: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const endpoints = await webhooksService.list(organizationId);
    res.status(200).json(endpoints.map(toWebhookEndpointResponse));
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const webhook = getWebhook(req);
    const body = req.body as UpdateWebhookEndpointRequest;

    const updated = await webhooksService.update(webhook, body);
    res.status(200).json(toWebhookEndpointResponse(updated));
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    const webhook = getWebhook(req);
    await webhooksService.remove(webhook);
    res.status(204).send();
  }) satisfies RequestHandler,

  rotateSecret: (async (req, res) => {
    const webhook = getWebhook(req);
    const { endpoint, secret } = await webhooksService.rotateSecret(webhook);
    res.status(200).json(toWebhookEndpointWithSecretResponse(endpoint, secret));
  }) satisfies RequestHandler,

  sendTest: (async (req, res) => {
    const webhook = getWebhook(req);
    await webhooksService.sendTestEvent(webhook);
    res.status(202).send();
  }) satisfies RequestHandler,

  listDeliveries: (async (req, res) => {
    const webhook = getWebhook(req);
    const query = req.query as unknown as WebhookDeliveryListQuery;

    const page = await webhooksService.listDeliveries(webhook, query.cursor, query.limit);
    res.status(200).json({ data: page.data.map(toWebhookDeliveryResponse), nextCursor: page.nextCursor });
  }) satisfies RequestHandler,
};
