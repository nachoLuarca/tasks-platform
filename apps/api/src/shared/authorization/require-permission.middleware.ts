import type { RequestHandler } from 'express';

import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { roleHasPermission, type Permission } from './permissions.js';

/**
 * Must run after `requireMembership`. For a user, checks the resolved role
 * against the matrix, same as always. For an API key, there is no role --
 * the key's own `scopes` (independent of whoever created it, PHASE.md
 * decision 8) are checked directly against the same `Permission` vocabulary.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth || !req.membership) {
      next(new UnauthorizedError('Missing membership context'));
      return;
    }

    if (req.auth.type === 'apiKey') {
      if (!req.auth.scopes.includes(permission)) {
        next(new ForbiddenError(`Missing scope: ${permission}`));
        return;
      }
      next();
      return;
    }

    if (!req.membership.role || !roleHasPermission(req.membership.role, permission)) {
      next(new ForbiddenError(`Missing permission: ${permission}`));
      return;
    }

    next();
  };
}
