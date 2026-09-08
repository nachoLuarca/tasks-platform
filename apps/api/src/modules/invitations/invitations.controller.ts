import type { RequestHandler } from 'express';

import type { CreateInvitationRequest } from '@tasks-platform/contracts';

import { requireUserId } from '../../shared/authorization/index.js';
import { UnauthorizedError } from '../../shared/errors/index.js';
import { usersService } from '../users/users.service.js';
import { toCreateInvitationResponse, toInvitationPreviewResponse, toInvitationResponse } from './invitations.mapper.js';
import { invitationsService } from './invitations.service.js';

const getAuthenticatedUserId = requireUserId;

function getOrganizationId(req: { membership?: { organizationId: string } }): string {
  if (!req.membership) {
    throw new UnauthorizedError('Missing membership context');
  }
  return req.membership.organizationId;
}

export const invitationsController = {
  create: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const invitedById = getAuthenticatedUserId(req);
    const body = req.body as CreateInvitationRequest;

    const invitation = await invitationsService.create(organizationId, invitedById, body.email, body.role);

    res.status(201).json(toCreateInvitationResponse(invitation));
  }) satisfies RequestHandler,

  listPending: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const invitations = await invitationsService.listPending(organizationId);
    res.status(200).json(invitations.map(toInvitationResponse));
  }) satisfies RequestHandler,

  revoke: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const invitationId = req.params.id as string;
    await invitationsService.revoke(organizationId, invitationId);
    res.status(204).send();
  }) satisfies RequestHandler,

  preview: (async (req, res) => {
    const token = req.params.token as string;
    const preview = await invitationsService.preview(token);
    res.status(200).json(toInvitationPreviewResponse(preview));
  }) satisfies RequestHandler,

  accept: (async (req, res) => {
    const token = req.params.token as string;
    const userId = getAuthenticatedUserId(req);
    const user = await usersService.getById(userId);

    await invitationsService.accept(token, userId, user.email);
    res.status(204).send();
  }) satisfies RequestHandler,
};
