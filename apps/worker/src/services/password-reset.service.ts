import {
  ACCOUNT_EMAIL_JOB_OPTIONS,
  accountTokensService,
  buildAccountTokenLink,
  emailQueue,
} from '@tasks-platform/shared';

import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { usersRepository } from '../repositories/users.repository.js';

const WINDOW_MS = 60 * 60 * 1000;

export type PasswordResetRequestOutcome = 'email-queued' | 'no-account' | 'limit-reached';

/**
 * The account-dependent half of POST /v1/auth/forgot-password, run here so
 * the api's response never depends on it (see passwordResetService in
 * apps/api and docs/adr/0011-account-recovery.md). Whatever happens here --
 * no account, limit reached, email queued -- the requester already got the
 * same 202.
 *
 * The per-address limit (PASSWORD_RESET_MAX_PER_HOUR) counts reset tokens
 * issued to the account in the last hour. Past it, the request is dropped
 * silently rather than answered with a 429, which is exactly what keeps the
 * limit from becoming an existence oracle.
 *
 * Neither the email address nor the token is ever logged: the address is
 * personal data (and, for an unknown address, a record of someone probing),
 * the token is a credential.
 */
export async function handlePasswordResetRequest(email: string): Promise<PasswordResetRequestOutcome> {
  const user = await usersRepository.findActiveByEmail(email);
  if (!user) {
    logger.info('Password reset requested for an address with no active account; nothing sent');
    return 'no-account';
  }

  const issuedInWindow = await accountTokensService.countIssuedSince(
    'password-reset',
    user.id,
    new Date(Date.now() - WINDOW_MS),
  );
  if (issuedInWindow >= config.passwordResetMaxPerHour) {
    logger.warn({ userId: user.id }, 'Password reset email limit reached for this account; request dropped');
    return 'limit-reached';
  }

  const { token } = await accountTokensService.issue('password-reset', user.id);
  await emailQueue().add(
    'password-reset',
    {
      template: 'password-reset',
      to: user.email,
      name: user.name,
      resetUrl: buildAccountTokenLink('password-reset', token),
    },
    ACCOUNT_EMAIL_JOB_OPTIONS,
  );
  return 'email-queued';
}
