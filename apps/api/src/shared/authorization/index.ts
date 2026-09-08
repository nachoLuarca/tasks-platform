export { PERMISSIONS, roleHasPermission, permissionsForRole, canActOnResource } from './permissions.js';
export type { Permission } from './permissions.js';
export { requireMembership } from './require-membership.middleware.js';
export { requirePermission } from './require-permission.middleware.js';
export { API_KEY_ALLOWED_PERMISSIONS, isPermissionGrantableToApiKey } from './api-key-scopes.js';
export { requireUserId, requireRole } from './request-actor.js';
export type { AuthContext } from './request-actor.js';
