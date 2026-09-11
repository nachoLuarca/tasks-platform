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

  /**
   * Records that the user proved control of their address -- by consuming a
   * verification token, or by accepting an invitation that was sent to it.
   * Pass the transaction of whichever of those authorized it.
   */
  async markEmailVerified(id: string, client?: DbClient): Promise<void> {
    await usersRepository.markEmailVerified(id, new Date(), client);
  },

  async updateName(id: string, name: string): Promise<UserEntity> {
    return usersRepository.updateName(id, name);
  },

  /**
   * Sets an already-hashed password with no current-password check -- only
   * for callers that authorized the change some other way (password reset,
   * through a consumed token). The hash is computed by the caller, outside
   * its transaction, so Argon2's cost doesn't hold database locks.
   */
  async replacePasswordHash(id: string, passwordHash: string, client?: DbClient): Promise<void> {
    await usersRepository.updatePasswordHash(id, passwordHash, client);
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
