import type { Permission } from './permissions.js';

/**
 * Read scopes: the same read-only set Phase 4 shipped.
 */
export const API_KEY_READ_SCOPES = ['project:read', 'task:read', 'member:list'] as const satisfies readonly Permission[];

/**
 * Write scopes (Phase 4.5): creating and modifying tasks, projects, comments
 * and labels -- PHASE.md's list, taken literally, so no deletion scope
 * (`project:delete`, `task:delete:any`, `comment:delete:any`) is grantable.
 *
 * Wherever the matrix splits a permission into `:own`/`:any`, only `:any` is
 * here. "Own" means "I created it or it's assigned to me", and a key is
 * neither (PHASE.md decision 6): `task:update:own` would never match
 * anything for a key, so offering it would only be a scope that silently
 * does nothing. Permissions with no split (`task:create`, `comment:create`,
 * `task:assign`, `label:manage`, `project:create`/`update`) are organization-
 * wide already. `task:assign:self` is excluded for the same reason as
 * `:own`: a key has no self to assign.
 *
 * Still never grantable: human and integration management (`member:*` writes,
 * `invitation:*`, `organization:*`, `ownership:transfer`, `webhook:manage`,
 * `apikey:manage`). A key minting keys or re-pointing webhooks would be a
 * self-referential escalation path with no legitimate use case.
 */
export const API_KEY_WRITE_SCOPES = [
  'project:create',
  'project:update',
  'task:create',
  'task:update:any',
  'task:assign',
  'comment:create',
  'label:manage',
] as const satisfies readonly Permission[];

export const API_KEY_ALLOWED_PERMISSIONS: readonly Permission[] = [...API_KEY_READ_SCOPES, ...API_KEY_WRITE_SCOPES];

export function isPermissionGrantableToApiKey(permission: Permission): boolean {
  return API_KEY_ALLOWED_PERMISSIONS.includes(permission);
}
