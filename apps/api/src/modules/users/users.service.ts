import type { DbClient } from '../../shared/db/index.js';
import { NotFoundError, UnauthorizedError } from '../../shared/errors/index.js';
import { hashPassword, verifyPassword } from '../../shared/security/index.js';
import { usersRepository } from './users.repository.js';
import type { UserEntity } from './users.types.js';

export const usersService = {
  async createUser(
    input: { email: string; password: string; name: string },
    client?: DbClient,
  ): Promise<UserEntity> {
    const passwordHash = await hashPassword(input.password);
    return usersRepository.create(
      { email: input.email, passwordHash, name: input.name },
      client,
    );
  },

  async getById(id: string): Promise<UserEntity> {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  },

  async updateName(id: string, name: string): Promise<UserEntity> {
    return usersRepository.updateName(id, name);
  },

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserEntity> {
    const user = await usersService.getById(id);

    const isCurrentPasswordValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);
    return usersRepository.updatePasswordHash(id, passwordHash);
  },
};
