import { prisma, type DbClient } from '../../shared/db/index.js';
import type { Permission } from '../../shared/authorization/index.js';
import type { ApiKeyEntity, CreateApiKeyInput } from './api-keys.types.js';

type ApiKeyRow = {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  createdById: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function toEntity(row: ApiKeyRow): ApiKeyEntity {
  return { ...row, scopes: row.scopes as Permission[] };
}

/** How long a fresh `lastUsedAt` write is trusted before the next request writes again -- see api-keys.service.ts authenticate(). */
const LAST_USED_STALE_AFTER_MS = 5 * 60 * 1000;

export const apiKeysRepository = {
  async create(input: CreateApiKeyInput, client: DbClient = prisma): Promise<ApiKeyEntity> {
    const row = await client.apiKey.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        prefix: input.prefix,
        keyHash: input.keyHash,
        scopes: input.scopes,
        createdById: input.createdById,
        expiresAt: input.expiresAt,
      },
    });
    return toEntity(row);
  },

  async findByHash(keyHash: string, client: DbClient = prisma): Promise<ApiKeyEntity | null> {
    const row = await client.apiKey.findUnique({ where: { keyHash } });
    return row ? toEntity(row) : null;
  },

  async findById(id: string, organizationId: string, client: DbClient = prisma): Promise<ApiKeyEntity | null> {
    const row = await client.apiKey.findFirst({ where: { id, organizationId } });
    return row ? toEntity(row) : null;
  },

  async list(organizationId: string, client: DbClient = prisma): Promise<ApiKeyEntity[]> {
    const rows = await client.apiKey.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
    return rows.map(toEntity);
  },

  async revoke(id: string, client: DbClient = prisma): Promise<void> {
    await client.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  /**
   * Fire-and-forget from the request path (see api-keys.service.ts): only
   * writes when the last recorded use is missing or older than the stale
   * window, so a key hammered with traffic doesn't turn every single
   * request into a write -- "sin escribir en cada petición si se puede
   * evitar" (PHASE.md decision, Phase 4).
   */
  async touchLastUsedIfStale(id: string, client: DbClient = prisma): Promise<void> {
    await client.apiKey.updateMany({
      where: {
        id,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(Date.now() - LAST_USED_STALE_AFTER_MS) } }],
      },
      data: { lastUsedAt: new Date() },
    });
  },
};
