import type { RequestHandler } from 'express';

import type { CreateOrganizationRequest } from '@tasks-platform/contracts';

import { UnauthorizedError } from '../../shared/errors/index.js';
import { toOrganizationResponse } from './organizations.mapper.js';
import { organizationsService } from './organizations.service.js';

function getAuthenticatedUserId(req: { auth?: { userId: string } }): string {
  if (!req.auth) {
    throw new UnauthorizedError('Missing authentication context');
  }
  return req.auth.userId;
}

export const organizationsController = {
  create: (async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const body = req.body as CreateOrganizationRequest;
    const organization = await organizationsService.createOrganization(body.name, userId);
    res.status(201).json(toOrganizationResponse(organization));
  }) satisfies RequestHandler,

  list: (async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const organizations = await organizationsService.listForUser(userId);
    res.status(200).json(organizations.map(toOrganizationResponse));
  }) satisfies RequestHandler,

  getById: (async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const organization = await organizationsService.getForMember(userId, req.params.id as string);
    res.status(200).json(toOrganizationResponse(organization));
  }) satisfies RequestHandler,
};
