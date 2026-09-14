import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { changePasswordRequestSchema, updateProfileRequestSchema, userProfileSchema } from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

export function registerUsersPaths(registry: OpenAPIRegistry): void {
  registerOperation(registry, {
    operationId: 'updateProfile',
    method: 'patch',
    path: '/v1/users/me',
    tag: 'users',
    summary: 'Actualizar el perfil propio',
    auth: 'bearer',
    usersOnly: true,
    body: updateProfileRequestSchema.openapi('UpdateProfileRequest'),
    responses: { 200: jsonResponse('Perfil actualizado.', userProfileSchema.openapi('UserProfile')) },
  });

  registerOperation(registry, {
    operationId: 'changePassword',
    method: 'post',
    path: '/v1/users/me/password',
    tag: 'users',
    summary: 'Cambiar la contraseña',
    description: 'Exige la contraseña actual. Revoca las demas sesiones de la cuenta; la de la peticion sigue activa.',
    auth: 'bearer',
    usersOnly: true,
    body: changePasswordRequestSchema.openapi('ChangePasswordRequest'),
    responses: { 204: emptyResponse('Contraseña cambiada.') },
    errors: { 401: 'Falta el access token o es invalido, o la contraseña actual no coincide.' },
  });
}
