import { prisma, type DbClient } from '../../shared/db/index.js';
import type { CreateRefreshTokenInput, RefreshTokenEntity } from './auth.types.js';

function toEntity(row: {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
}): RefreshTokenEntity {
  return row;
}

export const authRepository = {
  async createRefreshToken(
    input: CreateRefreshTokenInput,
    client: DbClient = prisma,
  ): Promise<RefreshTokenEntity> {
    const row = await client.refreshToken.create({ data: input });
    return toEntity(row);
  },

  async findRefreshTokenByHash(
    tokenHash: string,
    client: DbClient = prisma,
  ): Promise<RefreshTokenEntity | null> {
    const row = await client.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toEntity(row) : null;
  },

  /** Revokes `id` and links it to the token that replaced it, atomically. */
  async revokeAndReplace(
    id: string,
    replacedById: string,
    client: DbClient = prisma,
  ): Promise<void> {
    await client.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById },
    });
  },

  async revokeById(id: string, client: DbClient = prisma): Promise<void> {
    await client.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  /** Revokes every still-active token in the family: reuse means theft. */
  async revokeFamily(familyId: string, client: DbClient = prisma): Promise<void> {
    await client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllForUser(
    userId: string,
    client: DbClient = prisma,
    exceptId?: string,
  ): Promise<void> {
    await client.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: new Date() },
    });
  },
};
