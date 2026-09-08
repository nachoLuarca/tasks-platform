import type { Permission } from './permissions.js';

/**
 * The subset of `PERMISSIONS` an API key is allowed to be created with.
 * PHASE.md says scopes are "subconjunto del vocabulario de permisos
 * existente, independientes de los roles" without listing which ones -- this
 * phase deliberately ships that subset as read-only (`*:read` plus
 * `member:list`), for a reason that isn't about trust, it's about identity:
 * `Task.createdById`/`Comment.authorId` and every "own"-scoped permission
 * (`task:update:own`, `comment:delete:own`, `task:assign:self`, ...) assume
 * the actor is a `User` row. An API key isn't one, so it can never be a
 * task's creator or a comment's author, and "own" has no meaning for it.
 * Every write permission in the matrix is either `:own`-only (meaningless
 * for a key) or a human-management action (`member:*`, `invitation:*`,
 * `organization:*`, `webhook:manage`, `apikey:manage` -- the last two
 * excluded for the additional, sharper reason that a key managing other
 * keys/webhooks is a privilege-escalation path with no legitimate use case
 * here). The remaining `:any` write permissions (`task:update:any`,
 * `task:delete:any`, `comment:delete:any`, `task:assign`, `label:manage`)
 * are plausible candidates for a future "automation" scope tier once the
 * activity actor model (already polymorphic, see TaskActivity) extends to
 * `Task`/`Comment` too -- tracked in docs/DEBT.md rather than implemented
 * here, to keep this phase's blast radius to what PHASE.md actually asks
 * for: a read-only integration credential that proves scopes are enforced
 * independently of the creator's role.
 */
export const API_KEY_ALLOWED_PERMISSIONS: readonly Permission[] = [
  'project:read',
  'task:read',
  'member:list',
];

export function isPermissionGrantableToApiKey(permission: Permission): boolean {
  return (API_KEY_ALLOWED_PERMISSIONS as readonly string[]).includes(permission);
}
