import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { apiKeyCreatedResponseSchema, apiKeyListResponseSchema, createApiKeyRequestSchema } from '@tasks-platform/contracts';

import { API_KEY_READ_SCOPES, API_KEY_WRITE_SCOPES } from '../../shared/authorization/api-key-scopes.js';
import { emptyResponse, jsonResponse, registerOperation } from '../../shared/openapi/index.js';
import { API_KEY_PREFIX } from './api-keys.types.js';

const BASE = '/v1/organizations/:organizationId/api-keys';

const formatScopes = (scopes: readonly string[]): string => scopes.map((scope) => `\`${scope}\``).join(', ');

export function registerApiKeysPaths(registry: OpenAPIRegistry): void {
  registerOperation(registry, {
    operationId: 'createApiKey',
    method: 'post',
    path: BASE,
    tag: 'api-keys',
    summary: 'Crear una API key',
    description: [
      `La respuesta trae la clave completa (\`key\`, empieza con \`${API_KEY_PREFIX}\`). Es la unica vez que aparece.`,
      `Scopes de lectura otorgables: ${formatScopes(API_KEY_READ_SCOPES)}.`,
      `Scopes de escritura otorgables: ${formatScopes(API_KEY_WRITE_SCOPES)}.`,
      'Quien crea la key tiene que tener cada scope que otorga.',
    ].join('\n\n'),
    auth: 'bearer',
    permission: 'apikey:manage',
    usersOnly: true,
    body: createApiKeyRequestSchema.openapi('CreateApiKeyRequest'),
    responses: { 201: jsonResponse('API key creada, con la clave completa.', apiKeyCreatedResponseSchema.openapi('ApiKeyCreated')) },
    errors: {
      403: 'Falta `apikey:manage`, la credencial es una API key, o se pide un scope que quien crea la key no tiene.',
      422: 'Algun scope no existe o no se puede otorgar a una API key.',
    },
  });

  registerOperation(registry, {
    operationId: 'listApiKeys',
    method: 'get',
    path: BASE,
    tag: 'api-keys',
    summary: 'Listar API keys',
    auth: 'bearer',
    permission: 'apikey:manage',
    responses: {
      200: jsonResponse('API keys de la organizacion: prefijo, scopes y ultimo uso, nunca la clave.', apiKeyListResponseSchema),
    },
  });

  registerOperation(registry, {
    operationId: 'revokeApiKey',
    method: 'delete',
    path: `${BASE}/:apiKeyId`,
    tag: 'api-keys',
    summary: 'Revocar una API key',
    description: 'La revocacion es inmediata: la siguiente peticion con esa key recibe `401`.',
    auth: 'bearer',
    permission: 'apikey:manage',
    responses: { 204: emptyResponse('API key revocada.') },
    errors: { 404: 'La organizacion o la API key no existen, o quien llama no es miembro.' },
  });
}
