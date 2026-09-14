import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  createOrganizationRequestSchema,
  organizationListResponseSchema,
  organizationResponseSchema,
  transferOwnershipRequestSchema,
  updateOrganizationRequestSchema,
} from '@tasks-platform/contracts';

import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';

const BASE = '/v1/organizations';
const NOT_A_MEMBER = 'La organizacion no existe o quien llama no es miembro (nunca se responde 403).';

export function registerOrganizationsPaths(registry: OpenAPIRegistry): void {
  const Organization = organizationResponseSchema.openapi('Organization');

  registerOperation(registry, {
    operationId: 'createOrganization',
    method: 'post',
    path: BASE,
    tag: 'organizations',
    summary: 'Crear una organizacion',
    description: 'Quien la crea queda como `OWNER`.',
    auth: 'bearer',
    usersOnly: true,
    body: createOrganizationRequestSchema.openapi('CreateOrganizationRequest'),
    responses: { 201: jsonResponse('Organizacion creada.', Organization) },
  });

  registerOperation(registry, {
    operationId: 'listOrganizations',
    method: 'get',
    path: BASE,
    tag: 'organizations',
    summary: 'Listar mis organizaciones',
    auth: 'bearer',
    usersOnly: true,
    responses: { 200: jsonResponse('Organizaciones de las que quien llama es miembro.', organizationListResponseSchema) },
  });

  registerOperation(registry, {
    operationId: 'getOrganization',
    method: 'get',
    path: `${BASE}/:organizationId`,
    tag: 'organizations',
    summary: 'Ver una organizacion',
    auth: 'bearer',
    responses: { 200: jsonResponse('La organizacion.', Organization) },
    errors: { 404: NOT_A_MEMBER },
  });

  registerOperation(registry, {
    operationId: 'updateOrganization',
    method: 'patch',
    path: `${BASE}/:organizationId`,
    tag: 'organizations',
    summary: 'Editar una organizacion',
    auth: 'bearer',
    permission: 'organization:update',
    body: updateOrganizationRequestSchema.openapi('UpdateOrganizationRequest'),
    responses: { 200: jsonResponse('Organizacion actualizada.', Organization) },
    errors: { 404: NOT_A_MEMBER },
  });

  registerOperation(registry, {
    operationId: 'deleteOrganization',
    method: 'delete',
    path: `${BASE}/:organizationId`,
    tag: 'organizations',
    summary: 'Eliminar una organizacion',
    auth: 'bearer',
    permission: 'organization:delete',
    responses: { 204: emptyResponse('Organizacion eliminada.') },
    errors: { 404: NOT_A_MEMBER },
  });

  registerOperation(registry, {
    operationId: 'transferOwnership',
    method: 'post',
    path: `${BASE}/:organizationId/transfer-ownership`,
    tag: 'organizations',
    summary: 'Transferir la propiedad',
    description: 'El miembro indicado pasa a ser el `OWNER` de la organizacion.',
    auth: 'bearer',
    permission: 'ownership:transfer',
    usersOnly: true,
    body: transferOwnershipRequestSchema.openapi('TransferOwnershipRequest'),
    responses: { 204: emptyResponse('Propiedad transferida.') },
    errors: {
      404: 'La organizacion no existe, quien llama no es miembro, o el usuario destino no es miembro.',
      409: 'El usuario destino ya es el owner.',
    },
  });
}
