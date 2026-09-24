import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordTokenStatusResponseSchema,
} from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

const INVALID_TOKEN = 'Token desconocido, ya usado o vencido (los tres casos responden igual).';

export function registerPasswordResetPaths(registry: OpenAPIRegistry): void {
  registerOperation(registry, {
    operationId: 'forgotPassword',
    method: 'post',
    path: '/v1/auth/forgot-password',
    tag: 'password-reset',
    summary: 'Pedir un enlace de recuperacion',
    description:
      'Responde siempre `202` con el mismo cuerpo, exista o no una cuenta con ese correo, para no revelar que direcciones estan registradas (ADR 0011).',
    auth: 'public',
    body: forgotPasswordRequestSchema.openapi('ForgotPasswordRequest'),
    responses: { 202: jsonResponse('Solicitud aceptada.', forgotPasswordResponseSchema.openapi('ForgotPasswordResponse')) },
    errors: { 429: 'Demasiados intentos desde esta IP (igual para cualquier correo).', 503: 'Redis no responde y el limitador de intentos no puede evaluarse.' },
  });

  registerOperation(registry, {
    operationId: 'checkPasswordResetToken',
    method: 'get',
    path: '/v1/auth/reset-password/:token',
    tag: 'password-reset',
    summary: 'Comprobar un token de recuperacion',
    description: 'Indica si el token sigue siendo valido, sin consumirlo.',
    auth: 'public',
    responses: {
      200: jsonResponse('El token es valido.', resetPasswordTokenStatusResponseSchema.openapi('ResetPasswordTokenStatus')),
    },
    errors: { 404: INVALID_TOKEN, 429: 'Demasiados intentos desde esta IP.', 503: 'Redis no responde y el limitador de intentos no puede evaluarse.' },
  });

  registerOperation(registry, {
    operationId: 'resetPassword',
    method: 'post',
    path: '/v1/auth/reset-password',
    tag: 'password-reset',
    summary: 'Restablecer la contraseña',
    description:
      'Consume el token, reemplaza la contraseña y revoca **todas** las sesiones de la cuenta, incluida la de quien llama (tambien se borra su cookie de refresh token).',
    auth: 'public',
    body: resetPasswordRequestSchema.openapi('ResetPasswordRequest'),
    responses: { 204: emptyResponse('Contraseña restablecida.') },
    errors: { 404: INVALID_TOKEN, 429: 'Demasiados intentos desde esta IP.', 503: 'Redis no responde y el limitador de intentos no puede evaluarse.' },
  });
}
