import type { Role } from '@tasks-platform/contracts';

import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
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
 * Every controller that needs "the current user" (to record as a task's
 * creator, a comment's author, or to resolve "me") calls this instead of
 * reading `req.auth.userId` directly. An API key is a valid `req.auth`, but
 * it isn't a user -- see api-key-scopes.ts for why no API key scope reaches
 * an endpoint that would need one anyway; this is the defense-in-depth
 * backstop for that invariant, with a clear error instead of
 * `undefined.userId` if it's ever wrong.
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
 * Every controller that needs "the caller's role" (to hand to a service
 * that still checks the matrix itself, e.g. tasksService.update) calls this.
 * `req.membership.role` is `null` exactly when the caller authenticated with
 * an API key (see require-membership.middleware.ts) -- in practice this
 * never actually throws, because every endpoint that reaches a service
 * needing a role is gated by a permission no API key can hold (see
 * api-key-scopes.ts), but the check exists so that invariant is enforced
 * here too, not only trusted by convention.
 */
export function requireRole(req: { membership?: { role: Role | null } }): Role {
  if (!req.membership || !req.membership.role) {
    throw new ForbiddenError('This action requires a member role, not an API key');
  }
  return req.membership.role;
}
