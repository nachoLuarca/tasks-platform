import {
  accountTokensService,
  PASSWORD_RESET_REQUEST_JOB_OPTIONS,
  passwordResetRequestQueue,
} from '@tasks-platform/shared';

import { prisma } from '../../shared/db/index.js';
import { NotFoundError } from '../../shared/errors/index.js';
import { hashPassword } from '../../shared/security/index.js';
import { authService } from '../auth/auth.service.js';
import { usersService } from '../users/users.service.js';

const INVALID_TOKEN_MESSAGE = 'Invalid or expired password reset token';

export const passwordResetService = {
  /**
   * Deliberately never looks the email up. The request does the exact same
   * work whether or not an account exists -- validate, rate-limit, enqueue
   * one job -- so neither the response nor its timing can reveal which
   * addresses are registered (PHASE.md decision 3, Phase 4.5). The worker
   * resolves the account, applies the per-account limit and sends the email,
   * all out of band; see apps/worker/src/services/password-reset.service.ts
   * and docs/adr/0011-account-recovery.md.
   */
  async requestReset(email: string): Promise<void> {
    await passwordResetRequestQueue().add('password-reset-request', { email }, PASSWORD_RESET_REQUEST_JOB_OPTIONS);
  },

  /** Lets a client warn about a dead link before asking for a new password. Never consumes the token. */
  async checkToken(token: string): Promise<{ expiresAt: Date }> {
    const valid = await accountTokensService.findValid('password-reset', token);
    if (!valid) {
      throw new NotFoundError(INVALID_TOKEN_MESSAGE);
    }
    return { expiresAt: valid.expiresAt };
  },

  /**
   * Consumes the token, replaces the password and revokes every session of
   * the account -- all of them, unlike a normal password change, which keeps
   * the caller's own (PHASE.md decision 4; ADR 0011 explains why). One
   * transaction, so a failure anywhere leaves the token unused and the old
   * password and sessions untouched.
   *
   * The token is checked once *before* hashing: Argon2id is deliberately
   * expensive, and hashing first would let anyone make the server burn a
   * hash per request with garbage tokens. The consume inside the
   * transaction is still the one that counts -- it's the atomic check, and
   * it's what makes a second use of the same token fail even under a race.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!(await accountTokensService.findValid('password-reset', token))) {
      throw new NotFoundError(INVALID_TOKEN_MESSAGE);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      const consumed = await accountTokensService.consume('password-reset', token, tx);
      if (!consumed) {
        throw new NotFoundError(INVALID_TOKEN_MESSAGE);
      }
      await usersService.replacePasswordHash(consumed.userId, passwordHash, tx);
      await accountTokensService.invalidateOutstanding('password-reset', consumed.userId, tx);
      await authService.revokeAllSessions(consumed.userId, tx);
    });
  },
};
