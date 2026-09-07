import type { RequestHandler } from 'express';

import type { TransferOwnershipRequest, UpdateMemberRoleRequest } from '@tasks-platform/contracts';

import { UnauthorizedError } from '../../shared/errors/index.js';
import { toMemberResponse } from './members.mapper.js';
import { membersService } from './members.service.js';

function getAuthenticatedUserId(req: { auth?: { userId: string } }): string {
  if (!req.auth) {
    throw new UnauthorizedError('Missing authentication context');
  }
  return req.auth.userId;
}

function getMembershipContext(req: {
  membership?: { organizationId: string; membershipId: string; role: string };
}): { organizationId: string; membershipId: string; role: string } {
  if (!req.membership) {
    throw new UnauthorizedError('Missing membership context');
  }
  return req.membership;
}

export const membersController = {
  list: (async (req, res) => {
    const { organizationId } = getMembershipContext(req);
    const members = await membersService.list(organizationId);
    res.status(200).json(members.map(toMemberResponse));
  }) satisfies RequestHandler,

  updateRole: (async (req, res) => {
    const { organizationId } = getMembershipContext(req);
    const body = req.body as UpdateMemberRoleRequest;
    const targetUserId = req.params.userId as string;

    const membership = await membersService.updateRole(organizationId, targetUserId, body.role);
    res.status(200).json({
      userId: membership.userId,
      role: membership.role,
      joinedAt: membership.joinedAt.toISOString(),
    });
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    const { organizationId } = getMembershipContext(req);
    const targetUserId = req.params.userId as string;

    await membersService.remove(organizationId, targetUserId);
    res.status(204).send();
  }) satisfies RequestHandler,

  leave: (async (req, res) => {
    const { organizationId } = getMembershipContext(req);
    const userId = getAuthenticatedUserId(req);

    await membersService.leave(organizationId, userId);
    res.status(204).send();
  }) satisfies RequestHandler,

  transferOwnership: (async (req, res) => {
    const { organizationId, membershipId } = getMembershipContext(req);
    const body = req.body as TransferOwnershipRequest;

    await membersService.transferOwnership(organizationId, membershipId, body.userId);
    res.status(204).send();
  }) satisfies RequestHandler,
};
