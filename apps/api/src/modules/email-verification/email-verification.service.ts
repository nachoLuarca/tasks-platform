import { ACCOUNT_EMAIL_JOB_OPTIONS, accountTokensService, buildAccountTokenLink, emailQueue } from '@tasks-platform/shared';

import { config } from '../../shared/config/index.js';
import { prisma } from '../../shared/db/index.js';
import { ConflictError, NotFoundError, TooManyRequestsError } from '../../shared/errors/index.js';
import { usersService } from '../users/users.service.js';

const WINDOW_MS = 60 * 60 * 1000;

/**
 * Email verification never gates access (PHASE.md decision 1, Phase 4.5;
 * see docs/adr/0011-account-recovery.md): nothing in this module is called
 * from an authorization path. It only records `User.emailVerifiedAt`, which
 * GET /v1/auth/me exposes so a client can show a reminder.
 */
export const emailVerificationService = {
  /**
   * Issues a fresh token and queues the email for the worker to send --
   * the same path the invitation email takes. The raw token exists only in
   * the queued job's link; the table keeps its hash.
   */
  async sendVerificationEmail(user: { id: string; email: string; name: string }): Promise<void> {
    const { token } = await accountTokensService.issue('email-verification', user.id);
    await emailQueue().add(
      'email-verification',
      {
        template: 'email-verification',
        to: user.email,
        name: user.name,
        verifyUrl: buildAccountTokenLink('email-verification', token),
      },
      ACCOUNT_EMAIL_JOB_OPTIONS,
    );
  },

  /**
   * At most EMAIL_VERIFICATION_MAX_PER_HOUR verification emails per account
   * in the last hour, counted from the tokens actually issued (the
   * registration email included), so the limit holds across api instances
   * with no extra state. Retry-After is the full window: an upper bound,
   * never too early.
   */
  async resend(userId: string): Promise<void> {
    const user = await usersService.getById(userId);
    if (user.emailVerifiedAt) {
      throw new ConflictError('Email is already verified');
    }

    const issuedInWindow = await accountTokensService.countIssuedSince(
      'email-verification',
      user.id,
      new Date(Date.now() - WINDOW_MS),
    );
    if (issuedInWindow >= config.accountEmails.verificationMaxPerHour) {
      throw new TooManyRequestsError(WINDOW_MS / 1000, 'Too many verification emails requested, try again later');
    }

    await emailVerificationService.sendVerificationEmail(user);
  },

  /**
   * Consumes the token and marks the address verified in one transaction.
   * Every other outstanding verification token of the user is burned too:
   * once verified, older links have nothing left to prove. Unknown, used
   * and expired tokens all get the same 404.
   */
  async verify(token: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const consumed = await accountTokensService.consume('email-verification', token, tx);
      if (!consumed) {
        throw new NotFoundError('Invalid or expired verification token');
      }
      await usersService.markEmailVerified(consumed.userId, tx);
      await accountTokensService.invalidateOutstanding('email-verification', consumed.userId, tx);
    });
  },
};
