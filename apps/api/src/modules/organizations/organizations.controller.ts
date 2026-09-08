import type { RequestHandler } from 'express';

import type { CreateOrganizationRequest, UpdateOrganizationRequest } from '@tasks-platform/contracts';

import { requireUserId } from '../../shared/authorization/index.js';
import { toOrganizationResponse } from './organizations.mapper.js';
import { organizationsService } from './organizations.service.js';

const getAuthenticatedUserId = requireUserId;

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
    const organization = await organizationsService.getById(req.params.organizationId as string);
    res.status(200).json(toOrganizationResponse(organization));
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const body = req.body as UpdateOrganizationRequest;
    const organization = await organizationsService.update(req.params.organizationId as string, body.name);
    res.status(200).json(toOrganizationResponse(organization));
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    await organizationsService.remove(req.params.organizationId as string);
    res.status(204).send();
  }) satisfies RequestHandler,
};
