import type { OpenAPIRegistry, ResponseConfig } from '@asteasolutions/zod-to-openapi';

import {
  authSessionResponseSchema,
  loginRequestSchema,
  refreshResponseSchema,
  registerRequestSchema,
  userProfileSchema,
} from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';
import { REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE_PATH } from './auth.types.js';

const SETS_REFRESH_COOKIE: ResponseConfig['headers'] = {
  'Set-Cookie': {
    description: `Refresh token nuevo en la cookie \`${REFRESH_TOKEN_COOKIE}\` (HttpOnly, path \`${REFRESH_TOKEN_COOKIE_PATH}\`).`,
    schema: { type: 'string' },
  },
};

const CLEARS_REFRESH_COOKIE: ResponseConfig['headers'] = {
  'Set-Cookie': {
    description: `Borra la cookie \`${REFRESH_TOKEN_COOKIE}\`.`,
    schema: { type: 'string' },
  },
};

export function registerAuthPaths(registry: OpenAPIRegistry): void {
  const AuthSession = authSessionResponseSchema.openapi('AuthSession');

  registerOperation(registry, {
    operationId: 'register',
    method: 'post',
    path: '/v1/auth/register',
    tag: 'auth',
    summary: 'Registrarse',
    description: 'Crea el usuario, su organizacion personal (como `OWNER`) y una sesion, y encola el correo de verificacion.',
    auth: 'public',
    body: registerRequestSchema.openapi('RegisterRequest'),
    responses: { 201: jsonResponse('Cuenta creada y sesion iniciada.', AuthSession, SETS_REFRESH_COOKIE) },
    errors: {
      409: 'Ya existe una cuenta con ese correo.',
      429: 'Demasiados intentos desde esta IP.',
      503: 'Redis no responde y el limitador de intentos no puede evaluarse.',
    },
  });

  registerOperation(registry, {
    operationId: 'login',
    method: 'post',
    path: '/v1/auth/login',
    tag: 'auth',
    summary: 'Iniciar sesion',
    auth: 'public',
    body: loginRequestSchema.openapi('LoginRequest'),
    responses: { 200: jsonResponse('Sesion iniciada.', AuthSession, SETS_REFRESH_COOKIE) },
    errors: {
      401: 'Correo o contraseña incorrectos (los dos casos responden igual).',
      429: 'Demasiados intentos desde esta IP.',
      503: 'Redis no responde y el limitador de intentos no puede evaluarse.',
    },
  });

  registerOperation(registry, {
    operationId: 'refreshSession',
    method: 'post',
    path: '/v1/auth/refresh',
    tag: 'auth',
    summary: 'Renovar el access token',
    description:
      'Rota el refresh token de la cookie: el presentado deja de servir y la respuesta fija uno nuevo. Presentar uno ya rotado se trata como reuso y revoca toda su familia de tokens (ADR 0003).',
    auth: 'refreshCookie',
    responses: { 200: jsonResponse('Access token nuevo.', refreshResponseSchema.openapi('RefreshResponse'), SETS_REFRESH_COOKIE) },
    errors: {
      401: 'Falta la cookie, o el refresh token es invalido, esta vencido, fue revocado o ya se habia usado.',
      429: 'Demasiados intentos desde esta IP.',
      503: 'Redis no responde y el limitador de intentos no puede evaluarse.',
    },
  });

  registerOperation(registry, {
    operationId: 'logout',
    method: 'post',
    path: '/v1/auth/logout',
    tag: 'auth',
    summary: 'Cerrar la sesion actual',
    description: 'Revoca el refresh token de la cookie, si viene, y la borra. Responde `204` aunque no haya sesion.',
    auth: 'public',
    responses: { 204: emptyResponse('Sesion cerrada.', CLEARS_REFRESH_COOKIE) },
  });

  registerOperation(registry, {
    operationId: 'logoutAll',
    method: 'post',
    path: '/v1/auth/logout-all',
    tag: 'auth',
    summary: 'Cerrar todas las sesiones',
    description: 'Revoca todos los refresh tokens del usuario. Los access tokens ya emitidos siguen valiendo hasta vencer.',
    auth: 'bearer',
    usersOnly: true,
    responses: { 204: emptyResponse('Sesiones cerradas.', CLEARS_REFRESH_COOKIE) },
  });

  registerOperation(registry, {
    operationId: 'getMe',
    method: 'get',
    path: '/v1/auth/me',
    tag: 'auth',
    summary: 'Ver el perfil propio',
    description: '`emailVerifiedAt` es `null` mientras el correo no este verificado.',
    auth: 'bearer',
    usersOnly: true,
    responses: { 200: jsonResponse('Perfil del usuario autenticado.', userProfileSchema.openapi('UserProfile')) },
  });
}
