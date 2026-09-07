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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Suggested repartition from PHASE.md, with one adjustment: `member:leave`
 * is granted to every role (including OWNER). The OWNER-can't-leave-without-
 * transferring rule is a business invariant about *state* (is there another
 * owner to hand off to), not a role capability, so it belongs in
 * members.service, not in this matrix -- see the ADR.
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
  ],
  MEMBER: ['member:list', 'member:leave'],
  VIEWER: ['member:list', 'member:leave'],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
