import type { Role } from '@tasks-platform/contracts';

/**
 * Every permission the app knows about. Adding a typo'd permission anywhere
 * else in the codebase is a compile error, since `Permission` is derived
 * from this list rather than being a bare `string`. See
 * docs/adr/0005-permission-matrix.md for why this lives in code, not in the
 * database.
 */
export const PERMISSIONS = [
  'organization:update',
  'organization:delete',
  'member:list',
  'member:update-role',
  'member:remove',
  'member:leave',
  'ownership:transfer',
  'invitation:create',
  'invitation:list',
  'invitation:revoke',
  'project:create',
  'project:read',
  'project:update',
  'project:delete',
  'task:create',
  'task:read',
  'task:assign',
  'task:update:own',
  'task:update:any',
  'task:delete:own',
  'task:delete:any',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Suggested repartition from PHASE.md, with adjustments:
 *
 * - `member:leave` is granted to every role (including OWNER). The
 *   OWNER-can't-leave-without-transferring rule is a business invariant about
 *   *state* (is there another owner to hand off to), not a role capability,
 *   so it belongs in members.service, not in this matrix -- see
 *   docs/adr/0005-permission-matrix.md.
 * - `project:create` (Phase 3) is restricted to ADMIN/OWNER, not granted to
 *   MEMBER. PHASE.md's Phase 3 repartition says MEMBER "crea tareas y
 *   modifica las propias" and that ADMIN/OWNER "gestionan proyectos", without
 *   listing project creation under MEMBER; creating a project is a
 *   structural, org-wide decision (it reserves a key, starts a task
 *   sequence), closer to "managing" than to day-to-day content work, so it
 *   stays with the roles that manage projects. See
 *   docs/adr/0005-permission-matrix.md for the full reasoning.
 * - `task:assign` is also restricted to ADMIN/OWNER, not MEMBER. Unlike
 *   `task:update`/`task:delete`, PHASE.md gives it no own/any scope variant,
 *   so it can't be limited to "assigning tasks you created" -- granting it to
 *   MEMBER would let them reassign anyone's tasks to anyone. Reassigning work
 *   across the team is a management action, not content work.
 * - `task:update:own` / `task:delete:own` on MEMBER are enforced together
 *   with an actor/object ownership check in tasks.service.ts ("own" = creator
 *   or assignee of *that* task); the matrix only says which roles get which
 *   *scope* of permission, never which specific row that resolves to.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    'organization:update',
    'organization:delete',
    'member:list',
    'member:update-role',
    'member:remove',
    'member:leave',
    'ownership:transfer',
    'invitation:create',
    'invitation:list',
    'invitation:revoke',
    'project:create',
    'project:read',
    'project:update',
    'project:delete',
    'task:create',
    'task:read',
    'task:assign',
    'task:update:own',
    'task:update:any',
    'task:delete:own',
    'task:delete:any',
  ],
  ADMIN: [
    'organization:update',
    'member:list',
    'member:update-role',
    'member:remove',
    'member:leave',
    'invitation:create',
    'invitation:list',
    'invitation:revoke',
    'project:create',
    'project:read',
    'project:update',
    'project:delete',
    'task:create',
    'task:read',
    'task:assign',
    'task:update:own',
    'task:update:any',
    'task:delete:own',
    'task:delete:any',
  ],
  MEMBER: [
    'member:list',
    'member:leave',
    'project:read',
    'task:create',
    'task:read',
    'task:update:own',
    'task:delete:own',
  ],
  VIEWER: ['member:list', 'member:leave', 'project:read', 'task:read'],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * The "own vs any" scope check for a specific resource instance (e.g. "can
 * this actor update *this* task"). Still driven entirely by the matrix --
 * `isOwnResource` is the only thing the caller decides for itself (a plain
 * actor/object comparison such as "is this user the task's creator or
 * assignee"), never a role comparison.
 */
export function canActOnResource(
  role: Role,
  anyPermission: Permission,
  ownPermission: Permission,
  isOwnResource: boolean,
): boolean {
  return roleHasPermission(role, anyPermission) || (isOwnResource && roleHasPermission(role, ownPermission));
}
