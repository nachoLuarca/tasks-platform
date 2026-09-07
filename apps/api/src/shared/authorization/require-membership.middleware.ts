import type { RequestHandler } from 'express';

import { membersRepository } from '../../modules/members/members.repository.js';
import { organizationsRepository } from '../../modules/organizations/organizations.repository.js';
import { NotFoundError, UnauthorizedError } from '../errors/index.js';

/**
 * Resolves the organization from `:organizationId` in the path and the
 * caller's membership in it, leaving both on `req.membership`. A non-member
 * gets the same 404 as a nonexistent organization -- see PHASE.md decision 6
 * (Phase 2): membership is never revealed through the error type.
 */
export const requireMembership: RequestHandler = async (req, _res, next) => {
  if (!req.auth) {
    next(new UnauthorizedError('Missing authentication context'));
    return;
  }

  const organizationId = req.params.organizationId as string;

  const organization = await organizationsRepository.findById(organizationId);
  if (!organization) {
    next(new NotFoundError('Organization not found'));
    return;
  }

  const membership = await membersRepository.findByUserAndOrganization(req.auth.userId, organizationId);
  if (!membership) {
    next(new NotFoundError('Organization not found'));
    return;
  }

  req.membership = {
    organizationId,
    membershipId: membership.id,
    role: membership.role,
  };
  next();
};
