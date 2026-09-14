import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  invitationListResponseSchema,
  invitationPreviewResponseSchema,
} from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

const ORGANIZATION_BASE = '/v1/organizations/:organizationId/invitations';
const PUBLIC_BASE = '/v1/invitations';

export function registerInvitationsPaths(registry: OpenAPIRegistry): void {
  registerOperation(registry, {
    operationId: 'createInvitation',
    method: 'post',
    path: ORGANIZATION_BASE,
    tag: 'invitations',
    summary: 'Invitar a una persona',
    description: 'El enlace de aceptacion se envia por correo; nunca vuelve en la respuesta.',
    auth: 'bearer',
    permission: 'invitation:create',
    usersOnly: true,
    body: createInvitationRequestSchema.openapi('CreateInvitationRequest'),
    responses: { 201: jsonResponse('Invitacion creada y correo encolado.', createInvitationResponseSchema.openapi('Invitation')) },
    errors: {
      409: 'La persona ya es miembro, o ya tiene una invitacion pendiente.',
      422: 'La organizacion o quien invita ya no existen.',
    },
  });

  registerOperation(registry, {
    operationId: 'listPendingInvitations',
    method: 'get',
    path: ORGANIZATION_BASE,
    tag: 'invitations',
    summary: 'Listar invitaciones pendientes',
    auth: 'bearer',
    permission: 'invitation:list',
    responses: { 200: jsonResponse('Invitaciones pendientes.', invitationListResponseSchema) },
  });

  registerOperation(registry, {
    operationId: 'revokeInvitation',
    method: 'delete',
    path: `${ORGANIZATION_BASE}/:id`,
    tag: 'invitations',
    summary: 'Revocar una invitacion',
    auth: 'bearer',
    permission: 'invitation:revoke',
    responses: { 204: emptyResponse('Invitacion revocada.') },
    errors: { 404: 'La organizacion o la invitacion no existen, o quien llama no es miembro.' },
  });

  registerOperation(registry, {
    operationId: 'previewInvitation',
    method: 'get',
    path: `${PUBLIC_BASE}/:token`,
    tag: 'invitations',
    summary: 'Vista previa de una invitacion',
    description: 'Publica: solo lo necesario para decidir si aceptar.',
    auth: 'public',
    responses: { 200: jsonResponse('Datos de la invitacion.', invitationPreviewResponseSchema.openapi('InvitationPreview')) },
    errors: { 404: 'No hay ninguna invitacion con ese token.' },
  });

  registerOperation(registry, {
    operationId: 'acceptInvitation',
    method: 'post',
    path: `${PUBLIC_BASE}/:token/accept`,
    tag: 'invitations',
    summary: 'Aceptar una invitacion',
    description: 'El correo de la cuenta tiene que coincidir con el invitado. Aceptar tambien marca el correo como verificado.',
    auth: 'bearer',
    usersOnly: true,
    responses: { 204: emptyResponse('Quien llama ya es miembro de la organizacion.') },
    errors: {
      403: 'La invitacion fue enviada a otro correo, o la credencial es una API key.',
      404: 'No hay ninguna invitacion con ese token.',
      409: 'La invitacion fue revocada, ya se acepto o vencio, o quien llama ya es miembro.',
    },
  });
}
