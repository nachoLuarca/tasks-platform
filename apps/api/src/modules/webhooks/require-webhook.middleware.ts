import type { RequestHandler } from 'express';

import { NotFoundError, UnauthorizedError } from '../../shared/errors/index.js';
import { webhooksRepository } from './webhooks.repository.js';

/** Resolves `:webhookId`, scoped to the organization already resolved by `requireMembership`, onto `req.webhook`. */
export const requireWebhook: RequestHandler = async (req, _res, next) => {
  if (!req.membership) {
    next(new UnauthorizedError('Missing membership context'));
    return;
  }

  const webhookId = req.params.webhookId as string;
  const webhook = await webhooksRepository.findById(webhookId, req.membership.organizationId);
  if (!webhook) {
    next(new NotFoundError('Webhook endpoint not found'));
    return;
  }

  req.webhook = webhook;
  next();
};
