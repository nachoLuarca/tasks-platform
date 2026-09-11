import { randomBytes } from 'node:crypto';

import {
  actorHasPermission,
  isPermission,
  isPermissionGrantableToApiKey,
  type Permission,
  type UserActor,
} from '../../shared/authorization/index.js';
import { logger } from '../../shared/logger/index.js';
import { hashToken } from '../../shared/security/index.js';
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../shared/errors/index.js';
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
   * Three checks on the requested scopes, in this order:
   *
   * 1. Every scope exists in the permission vocabulary (422 otherwise).
   * 2. The creator holds every scope themselves, through their role in the
   *    matrix (403 otherwise). This is the privilege-escalation guard: an
   *    ADMIN must not be able to mint a credential stronger than they are.
   *    It runs *before* the catalog check on purpose, so it's enforced on
   *    its own merits -- it doesn't rely on the catalog happening to contain
   *    nothing the creator lacks today, and keeps holding if either the
   *    catalog or the matrix changes tomorrow.
   * 3. Every scope is in the API key catalog (422 otherwise; see
   *    shared/authorization/api-key-scopes.ts) -- some permissions are
   *    never grantable to a key, whoever asks.
   *
   * The full key is returned only here, never again -- `apiKeysRepository`
   * only ever stores its hash.
   */
  async create(
    organizationId: string,
    creator: UserActor,
    name: string,
    scopes: string[],
    expiresAt?: Date,
  ): Promise<{ apiKey: ApiKeyEntity; key: string }> {
    const uniqueScopes = [...new Set(scopes)];

    const unknown = uniqueScopes.filter((scope) => !isPermission(scope));
    if (unknown.length > 0) {
      throw new UnprocessableEntityError(`Unknown scope(s): ${unknown.join(', ')}`);
    }
    const permissions = uniqueScopes.filter(isPermission);

    const notHeld = permissions.filter((permission) => !actorHasPermission(creator, permission));
    if (notHeld.length > 0) {
      throw new ForbiddenError(`Cannot grant scope(s) you do not hold yourself: ${notHeld.join(', ')}`);
    }

    const notGrantable = permissions.filter((permission) => !isPermissionGrantableToApiKey(permission));
    if (notGrantable.length > 0) {
      throw new UnprocessableEntityError(`Scope(s) not allowed for an API key: ${notGrantable.join(', ')}`);
    }

    const { key, prefix, keyHash } = generateRawKey();
    const apiKey = await apiKeysRepository.create({
      organizationId,
      name,
      prefix,
      keyHash,
      scopes: permissions,
      createdById: creator.userId,
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
