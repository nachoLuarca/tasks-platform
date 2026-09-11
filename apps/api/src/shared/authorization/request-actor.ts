import type { Role } from '@tasks-platform/contracts';

import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import type { Actor, UserActor } from './actor.js';
import type { Permission } from './permissions.js';

/**
 * Set by `requireAuth`. A request is authenticated either as a human (a JWT
 * naming a `User`) or as a machine (an API key naming an `ApiKey`) -- never
 * both. `requireMembership`/`requirePermission` branch on `type` to resolve
 * membership/role for a user or organization/scopes for a key. See
 * require-membership.middleware.ts and require-permission.middleware.ts.
 */
export type AuthContext =
  | { type: 'user'; userId: string }
  | { type: 'apiKey'; apiKeyId: string; organizationId: string; scopes: readonly Permission[] };

/**
 * Controllers that need "the current user" as a *person* -- resolving "me",
 * or an action that only makes sense for a human (accepting an invitation,
 * editing one's own comment, creating an API key) -- call this. An API key
 * is a valid `req.auth` but not a user, so it gets a clear 403 here instead
 * of `undefined.userId` further down.
 */
export function requireUserId(req: { auth?: AuthContext }): string {
  if (!req.auth) {
    throw new UnauthorizedError('Missing authentication context');
  }
  if (req.auth.type !== 'user') {
    throw new ForbiddenError('This action requires a user, not an API key');
  }
  return req.auth.userId;
}

/**
 * For organization-scoped writes that either a member or an API key may
 * perform: hands the service an `Actor` (see actor.ts) carrying the role or
 * the scopes, so the service decides through the matrix vocabulary without
 * caring which of the two it got. Only valid behind `requireMembership`.
 */
export function requireActor(req: { auth?: AuthContext; membership?: { role: Role | null } }): Actor {
  if (!req.auth) {
    throw new UnauthorizedError('Missing authentication context');
  }
  if (req.auth.type === 'apiKey') {
    return { type: 'apiKey', apiKeyId: req.auth.apiKeyId, scopes: req.auth.scopes };
  }
  if (!req.membership?.role) {
    throw new UnauthorizedError('Missing membership context');
  }
  return { type: 'user', userId: req.auth.userId, role: req.membership.role };
}

/** `requireActor`, restricted to members: for org-scoped actions an API key must never perform itself. */
export function requireUserActor(req: { auth?: AuthContext; membership?: { role: Role | null } }): UserActor {
  const actor = requireActor(req);
  if (actor.type !== 'user') {
    throw new ForbiddenError('This action requires a user, not an API key');
  }
  return actor;
}
