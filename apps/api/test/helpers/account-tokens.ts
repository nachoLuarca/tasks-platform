import { accountTokensService, type AccountTokenPurpose } from '@tasks-platform/shared';

import { prisma } from '../../src/shared/db/index.js';

/**
 * Issues a real token through the same shared service the api (verification)
 * and the worker (password reset) issue them with, and returns the raw value
 * an email link would carry.
 *
 * The api suite deliberately doesn't fish tokens out of the queued email
 * jobs: with the docker stack up, the real worker consumes account-email
 * jobs and removes them from Redis as soon as they're sent
 * (ACCOUNT_EMAIL_JOB_OPTIONS), so reading them back would race it. The
 * email-link-to-Mailpit path is covered end to end in apps/worker's suite.
 */
export async function issueAccountToken(purpose: AccountTokenPurpose, userId: string): Promise<string> {
  const { token } = await accountTokensService.issue(purpose, userId);
  return token;
}

/** Moves every token of this purpose for the user into the past, the same way the invitation suite simulates expiry. */
export async function expireAccountTokens(purpose: AccountTokenPurpose, userId: string): Promise<void> {
  const data = { expiresAt: new Date(Date.now() - 1000) };
  if (purpose === 'email-verification') {
    await prisma.verificationToken.updateMany({ where: { userId }, data });
  } else {
    await prisma.passwordResetToken.updateMany({ where: { userId }, data });
  }
}
