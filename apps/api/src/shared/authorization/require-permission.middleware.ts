import type { RequestHandler } from 'express';

import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { roleHasPermission, type Permission } from './permissions.js';

/** Must run after `requireMembership`, which resolves `req.membership.role`. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.membership) {
      next(new UnauthorizedError('Missing membership context'));
      return;
    }

    if (!roleHasPermission(req.membership.role, permission)) {
      next(new ForbiddenError(`Missing permission: ${permission}`));
      return;
    }

    next();
  };
}
