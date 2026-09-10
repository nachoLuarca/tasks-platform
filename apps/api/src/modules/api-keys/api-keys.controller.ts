import type { RequestHandler } from 'express';

import type { CreateApiKeyRequest } from '@tasks-platform/contracts';

import { requireUserActor } from '../../shared/authorization/index.js';
import { UnauthorizedError } from '../../shared/errors/index.js';
import { toApiKeyCreatedResponse, toApiKeyResponse } from './api-keys.mapper.js';
import { apiKeysService } from './api-keys.service.js';

function getOrganizationId(req: { membership?: { organizationId: string } }): string {
  if (!req.membership) {
    throw new UnauthorizedError('Missing membership context');
  }
  return req.membership.organizationId;
}

export const apiKeysController = {
  create: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const creator = requireUserActor(req);
    const body = req.body as CreateApiKeyRequest;

    const { apiKey, key } = await apiKeysService.create(
      organizationId,
      creator,
      body.name,
      body.scopes,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    );
    res.status(201).json(toApiKeyCreatedResponse(apiKey, key));
  }) satisfies RequestHandler,

  list: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const apiKeys = await apiKeysService.list(organizationId);
    res.status(200).json(apiKeys.map(toApiKeyResponse));
  }) satisfies RequestHandler,

  revoke: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const apiKeyId = req.params.apiKeyId as string;
    await apiKeysService.revoke(organizationId, apiKeyId);
    res.status(204).send();
  }) satisfies RequestHandler,
};
