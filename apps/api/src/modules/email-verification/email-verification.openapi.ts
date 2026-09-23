import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { verifyEmailRequestSchema } from '@tasks-platform/contracts';

import { emptyResponse, registerOperation } from '../../shared/openapi/index.js';

export function registerEmailVerificationPaths(registry: OpenAPIRegistry): void {
  registerOperation(registry, {
    operationId: 'verifyEmail',
    method: 'post',
    path: '/v1/auth/verify-email',
    tag: 'email-verification',
    summary: 'Verificar el correo',
    description: 'Consume el token del enlace de verificacion. Es publico: el token es la prueba, y el enlace puede abrirse en un dispositivo sin sesion.',
    auth: 'public',
    body: verifyEmailRequestSchema.openapi('VerifyEmailRequest'),
    responses: { 204: emptyResponse('Correo verificado.') },
    errors: {
      404: 'Token desconocido, ya usado o vencido (los tres casos responden igual).',
      429: 'Demasiados intentos desde esta IP.',
      503: 'Redis no responde y el limitador de intentos no puede evaluarse.',
    },
  });

  registerOperation(registry, {
    operationId: 'resendVerificationEmail',
    method: 'post',
    path: '/v1/auth/resend-verification',
    tag: 'email-verification',
    summary: 'Reenviar el correo de verificacion',
    description: 'Encola un correo nuevo. La respuesta nunca incluye el token ni el enlace.',
    auth: 'bearer',
    usersOnly: true,
    responses: { 202: emptyResponse('Correo encolado.') },
    errors: {
      409: 'El correo ya esta verificado.',
      429: 'Se alcanzo el limite de reenvios por hora de esta cuenta.',
    },
  });
}
