import type { RequestHandler } from 'express';

import { membersRepository } from '../../modules/members/members.repository.js';
import { organizationsRepository } from '../../modules/organizations/organizations.repository.js';
import { NotFoundError, UnauthorizedError } from '../errors/index.js';

/**
 * Resolves the organization from `:organizationId` in the path.
 *
 * For a user (JWT), also resolves the caller's Membership and role, leaving
 * both on `req.membership`. A non-member gets the same 404 as a nonexistent
 * organization -- see PHASE.md decision 6 (Phase 2): membership is never
 * revealed through the error type.
 *
 * For an API key, there is no Membership row -- a key belongs to exactly one
 * organization directly (PHASE.md decision 7, Phase 4). The same 404 applies
 * if the key is presented against a *different* organization's path, for the
 * same non-disclosure reason. `membershipId`/`role` are left `null`;
 * `requirePermission` checks the key's scopes instead of a role.
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

  if (req.auth.type === 'apiKey') {
    if (req.auth.organizationId !== organizationId) {
      next(new NotFoundError('Organization not found'));
      return;
    }
    req.membership = { organizationId, membershipId: null, role: null };
    next();
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
