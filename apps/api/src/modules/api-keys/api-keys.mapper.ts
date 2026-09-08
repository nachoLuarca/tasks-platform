import type { ApiKeyCreatedResponse, ApiKeyResponse } from '@tasks-platform/contracts';

import type { ApiKeyEntity } from './api-keys.types.js';

export function toApiKeyResponse(apiKey: ApiKeyEntity): ApiKeyResponse {
  return {
    id: apiKey.id,
    organizationId: apiKey.organizationId,
    name: apiKey.name,
    prefix: apiKey.prefix,
    scopes: apiKey.scopes,
    lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
    expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
    revokedAt: apiKey.revokedAt ? apiKey.revokedAt.toISOString() : null,
    createdAt: apiKey.createdAt.toISOString(),
  };
}

export function toApiKeyCreatedResponse(apiKey: ApiKeyEntity, key: string): ApiKeyCreatedResponse {
  return { ...toApiKeyResponse(apiKey), key };
}
