import { prisma, type DbClient } from '../db/index.js';
import type { AccountTokenEntity, AccountTokenPurpose, CreateAccountTokenInput } from './account-tokens.types.js';

/**
 * VerificationToken and PasswordResetToken have identical columns, but
 * Prisma exposes them as two unrelated delegate types, so a union of the two
 * can't be called directly. Every method branches once on `purpose` instead
 * -- verbose, but each branch stays fully type-checked.
 */
export const accountTokensRepository = {
  async create(purpose: AccountTokenPurpose, input: CreateAccountTokenInput, client: DbClient = prisma): Promise<AccountTokenEntity> {
    return purpose === 'email-verification'
      ? client.verificationToken.create({ data: input })
      : client.passwordResetToken.create({ data: input });
  },

  async findByHash(purpose: AccountTokenPurpose, tokenHash: string, client: DbClient = prisma): Promise<AccountTokenEntity | null> {
    return purpose === 'email-verification'
      ? client.verificationToken.findUnique({ where: { tokenHash } })
      : client.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  async countCreatedSince(purpose: AccountTokenPurpose, userId: string, since: Date, client: DbClient = prisma): Promise<number> {
    const where = { userId, createdAt: { gte: since } };
    return purpose === 'email-verification'
      ? client.verificationToken.count({ where })
      : client.passwordResetToken.count({ where });
  },

  /**
   * Marks `id` used only if it is still unused and unexpired, as a single
   * conditional UPDATE: two concurrent consumers of the same token can't
   * both see `count === 1`. Returns whether this call was the one that won.
   */
  async markUsedIfUsable(purpose: AccountTokenPurpose, id: string, now: Date, client: DbClient = prisma): Promise<boolean> {
    const where = { id, usedAt: null, expiresAt: { gt: now } };
    const data = { usedAt: now };
    const result =
      purpose === 'email-verification'
        ? await client.verificationToken.updateMany({ where, data })
        : await client.passwordResetToken.updateMany({ where, data });
    return result.count === 1;
  },

  async markAllUnusedAsUsed(purpose: AccountTokenPurpose, userId: string, now: Date, client: DbClient = prisma): Promise<void> {
    const where = { userId, usedAt: null };
    const data = { usedAt: now };
    if (purpose === 'email-verification') {
      await client.verificationToken.updateMany({ where, data });
    } else {
      await client.passwordResetToken.updateMany({ where, data });
    }
  },
};
