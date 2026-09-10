import { prisma, type DbClient } from '../../shared/db/index.js';
import type { CreateUserInput, UserEntity } from './users.types.js';

function toEntity(row: {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UserEntity {
  return row;
}

export const usersRepository = {
  async findByEmail(email: string, client: DbClient = prisma): Promise<UserEntity | null> {
    const row = await client.user.findUnique({ where: { email } });
    return row ? toEntity(row) : null;
  },

  async findById(id: string, client: DbClient = prisma): Promise<UserEntity | null> {
    const row = await client.user.findFirst({ where: { id, deletedAt: null } });
    return row ? toEntity(row) : null;
  },

  async create(input: CreateUserInput, client: DbClient = prisma): Promise<UserEntity> {
    const row = await client.user.create({ data: input });
    return toEntity(row);
  },

  async updateName(id: string, name: string, client: DbClient = prisma): Promise<UserEntity> {
    const row = await client.user.update({ where: { id }, data: { name } });
    return toEntity(row);
  },

  /** Only sets the timestamp the first time: re-verifying keeps the original verification date. */
  async markEmailVerified(id: string, verifiedAt: Date, client: DbClient = prisma): Promise<void> {
    await client.user.updateMany({ where: { id, emailVerifiedAt: null }, data: { emailVerifiedAt: verifiedAt } });
  },

  async updatePasswordHash(
    id: string,
    passwordHash: string,
    client: DbClient = prisma,
  ): Promise<UserEntity> {
    const row = await client.user.update({ where: { id }, data: { passwordHash } });
    return toEntity(row);
  },
};
