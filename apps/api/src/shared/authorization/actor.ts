import type { Role } from '@tasks-platform/contracts';

import { roleHasPermission, type Permission } from './permissions.js';

/**
 * Who is performing a write, as services see it: a member acting through
 * their role, or an API key acting through its scopes. Services take this
 * instead of a bare `(role, userId)` pair so the same code path serves both,
 * and every authorization decision still goes through the matrix vocabulary
 * -- `roleHasPermission` for a user, the key's own scopes for a key.
 */
export type Actor =
  | { type: 'user'; userId: string; role: Role }
  | { type: 'apiKey'; apiKeyId: string; scopes: readonly Permission[] };

export type UserActor = Extract<Actor, { type: 'user' }>;

export function actorHasPermission(actor: Actor, permission: Permission): boolean {
  return actor.type === 'user' ? roleHasPermission(actor.role, permission) : actor.scopes.includes(permission);
}

/**
 * "Own vs any" for a specific resource, generalized from `canActOnResource`.
 * An API key never owns anything (PHASE.md decision 6, Phase 4.5): it is
 * neither the author nor the assignee of any row, so for a key only the
 * `:any` permission can ever apply, whatever `isOwnResource` says.
 */
export function canActorActOnResource(
  actor: Actor,
  anyPermission: Permission,
  ownPermission: Permission,
  isOwnResource: boolean,
): boolean {
  if (actorHasPermission(actor, anyPermission)) {
    return true;
  }
  return actor.type === 'user' && isOwnResource && actorHasPermission(actor, ownPermission);
}

/**
 * The actor as the pair of mutually exclusive columns every dual-authored
 * row stores (Task/Project creator, Comment author, TaskActivity actor):
 * exactly one of the two is non-null, mirroring the CHECK constraints.
 */
export function actorColumns(actor: Actor): { userId: string | null; apiKeyId: string | null } {
  return actor.type === 'user' ? { userId: actor.userId, apiKeyId: null } : { userId: null, apiKeyId: actor.apiKeyId };
}
