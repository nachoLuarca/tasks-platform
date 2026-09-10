import { randomBytes } from 'node:crypto';

import { isPermissionGrantableToApiKey, type Permission } from '../../shared/authorization/index.js';
import { logger } from '../../shared/logger/index.js';
import { hashToken } from '../../shared/security/index.js';
import { NotFoundError, UnprocessableEntityError } from '../../shared/errors/index.js';
import { apiKeysRepository } from './api-keys.repository.js';
import { API_KEY_PREFIX, DISPLAYED_PREFIX_LENGTH, type ApiKeyEntity } from './api-keys.types.js';

function generateRawKey(): { key: string; prefix: string; keyHash: string } {
  const random = randomBytes(24).toString('base64url');
  const key = `${API_KEY_PREFIX}${random}`;
  return { key, prefix: key.slice(0, DISPLAYED_PREFIX_LENGTH), keyHash: hashToken(key) };
}

export type ApiKeyAuthentication =
  | { ok: true; apiKeyId: string; organizationId: string; scopes: Permission[] }
  | { ok: false; reason: 'not-found' | 'revoked' | 'expired' };

export const apiKeysService = {
  /**
   * `scopes` are validated against `API_KEY_ALLOWED_PERMISSIONS`, not the
   * caller's own role -- an OWNER can only ever create a read-only key, the
   * same as anyone else, because the restriction isn't about trust, it's
   * about identity (see shared/authorization/api-key-scopes.ts). The full
   * key is returned only here, never again -- `apiKeysRepository` only ever
   * stores its hash.
   */
  async create(
    organizationId: string,
    createdById: string,
    name: string,
    scopes: string[],
    expiresAt?: Date,
  ): Promise<{ apiKey: ApiKeyEntity; key: string }> {
    const uniqueScopes = [...new Set(scopes)] as Permission[];
    const invalid = uniqueScopes.filter((scope) => !isPermissionGrantableToApiKey(scope));
    if (invalid.length > 0) {
      throw new UnprocessableEntityError(`Scope(s) not allowed for an API key: ${invalid.join(', ')}`);
    }

    const { key, prefix, keyHash } = generateRawKey();
    const apiKey = await apiKeysRepository.create({
      organizationId,
      name,
      prefix,
      keyHash,
      scopes: uniqueScopes,
      createdById,
      expiresAt,
    });
    return { apiKey, key };
  },

  async list(organizationId: string): Promise<ApiKeyEntity[]> {
    return apiKeysRepository.list(organizationId);
  },

  async revoke(organizationId: string, apiKeyId: string): Promise<void> {
    const apiKey = await apiKeysRepository.findById(apiKeyId, organizationId);
    if (!apiKey || apiKey.revokedAt) {
      throw new NotFoundError('API key not found');
    }
    await apiKeysRepository.revoke(apiKey.id);
  },

  /** Called from requireAuth for every request presenting a `tp_live_...` credential -- see auth/require-auth.middleware.ts. */
  async authenticate(rawKey: string): Promise<ApiKeyAuthentication> {
    const apiKey = await apiKeysRepository.findByHash(hashToken(rawKey));
    if (!apiKey) {
      return { ok: false, reason: 'not-found' };
    }
    if (apiKey.revokedAt) {
      return { ok: false, reason: 'revoked' };
    }
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { ok: false, reason: 'expired' };
    }

    // Deliberately not awaited: recording last-use is a courtesy for the
    // "GET /api-keys" listing, not something the request should ever wait
    // on or fail because of.
    void apiKeysRepository
      .touchLastUsedIfStale(apiKey.id)
      .catch((error: unknown) => logger.error({ err: error }, 'Failed to record API key last use'));

    return { ok: true, apiKeyId: apiKey.id, organizationId: apiKey.organizationId, scopes: apiKey.scopes };
  },
};
