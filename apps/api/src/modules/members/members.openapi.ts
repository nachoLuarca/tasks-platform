import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { memberListResponseSchema, memberResponseSchema, updateMemberRoleRequestSchema } from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

const BASE = '/v1/organizations/:organizationId/members';
const MEMBER_NOT_FOUND = 'La organizacion no existe, quien llama no es miembro, o el usuario indicado no es miembro.';

/** PATCH answers with only these three fields, not the whole member -- see membersController.updateRole. */
const memberRoleUpdatedSchema = memberResponseSchema.pick({ userId: true, role: true, joinedAt: true });

export function registerMembersPaths(registry: OpenAPIRegistry): void {
  registerOperation(registry, {
    operationId: 'listMembers',
    method: 'get',
    path: BASE,
    tag: 'members',
    summary: 'Listar miembros',
    auth: 'bearer',
    permission: 'member:list',
    responses: { 200: jsonResponse('Miembros de la organizacion, con su rol.', memberListResponseSchema) },
  });

  registerOperation(registry, {
    operationId: 'leaveOrganization',
    method: 'delete',
    path: `${BASE}/me`,
    tag: 'members',
    summary: 'Abandonar la organizacion',
    auth: 'bearer',
    permission: 'member:leave',
    usersOnly: true,
    responses: { 204: emptyResponse('Quien llama dejo de ser miembro.') },
    errors: { 409: 'El owner no puede irse sin transferir antes la propiedad.' },
  });

  registerOperation(registry, {
    operationId: 'updateMemberRole',
    method: 'patch',
    path: `${BASE}/:userId`,
    tag: 'members',
    summary: 'Cambiar el rol de un miembro',
    description: 'Para cambiar el owner se usa `transfer-ownership`, no este endpoint.',
    auth: 'bearer',
    permission: 'member:update-role',
    body: updateMemberRoleRequestSchema.openapi('UpdateMemberRoleRequest'),
    responses: { 200: jsonResponse('Rol actualizado.', memberRoleUpdatedSchema) },
    errors: {
      404: MEMBER_NOT_FOUND,
      409: 'Se intento cambiar el rol del owner o asignar `OWNER` directamente.',
    },
  });

  registerOperation(registry, {
    operationId: 'removeMember',
    method: 'delete',
    path: `${BASE}/:userId`,
    tag: 'members',
    summary: 'Expulsar a un miembro',
    auth: 'bearer',
    permission: 'member:remove',
    responses: { 204: emptyResponse('Miembro expulsado.') },
    errors: { 404: MEMBER_NOT_FOUND, 409: 'El owner no se puede expulsar; primero hay que transferir la propiedad.' },
  });
}
