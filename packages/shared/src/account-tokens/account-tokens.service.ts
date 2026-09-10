import { createHash, randomBytes } from 'node:crypto';

import { sharedConfig } from '../config/index.js';
import { prisma, type DbClient } from '../db/index.js';
import { accountTokensRepository } from './account-tokens.repository.js';
import type { AccountTokenPurpose, IssuedAccountToken } from './account-tokens.types.js';

const HOUR_MS = 60 * 60 * 1000;

/** PHASE.md decision 5 (Phase 4.5): verification lives a day, password reset only an hour because the risk is higher. */
export const ACCOUNT_TOKEN_TTL_MS: Readonly<Record<AccountTokenPurpose, number>> = {
  'email-verification': 24 * HOUR_MS,
  'password-reset': 1 * HOUR_MS,
};

/** 256 bits from the CSPRNG, base64url so it survives a URL fragment untouched. */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashOpaqueToken(token) };
}

/**
 * SHA-256, not Argon2: the input is already 256 random bits, so there is
 * nothing for a slow hash to protect against brute force, and a fast,
 * deterministic hash is what lets the token be looked up by an index.
 */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const WEB_APP_PATHS: Readonly<Record<AccountTokenPurpose, string>> = {
  'email-verification': '/verify-email',
  'password-reset': '/reset-password',
};

/**
 * The link that goes in the email: a page of the web client (WEB_APP_URL),
 * with the token in the fragment. A fragment never reaches any server --
 * not the web app's, not a proxy's access log, not a Referer header -- so
 * the only party that ever sees the raw token is the page's own script,
 * which then POSTs it to the API.
 */
export function buildAccountTokenLink(purpose: AccountTokenPurpose, token: string): string {
  const url = new URL(WEB_APP_PATHS[purpose], sharedConfig.webAppUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

/**
 * The single place that issues, checks and consumes verification and
 * password-reset tokens, shared by the api (verify, resend, reset) and the
 * worker (issuing a reset token after looking the account up), so the
 * single-use and expiry rules can never drift between the two processes.
 * Every method takes an optional transaction handle so the caller can bind
 * the token change to the account change it authorizes.
 */
export const accountTokensService = {
  async issue(purpose: AccountTokenPurpose, userId: string, client: DbClient = prisma): Promise<IssuedAccountToken> {
    const { token, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + ACCOUNT_TOKEN_TTL_MS[purpose]);
    await accountTokensRepository.create(purpose, { userId, tokenHash, expiresAt }, client);
    return { token, expiresAt };
  },

  /** How many tokens of this purpose were issued to the user since `since` -- the basis of the per-account send limits. */
  async countIssuedSince(purpose: AccountTokenPurpose, userId: string, since: Date, client: DbClient = prisma): Promise<number> {
    return accountTokensRepository.countCreatedSince(purpose, userId, since, client);
  },

  /**
   * Checks a presented token without consuming it: it must exist, be unused
   * and be unexpired. Unknown, used and expired all collapse to `null` on
   * purpose -- a caller has no legitimate need to tell them apart, and not
   * telling them apart is one less thing an endpoint can leak.
   */
  async findValid(purpose: AccountTokenPurpose, token: string, client: DbClient = prisma): Promise<{ userId: string; expiresAt: Date } | null> {
    const record = await accountTokensRepository.findByHash(purpose, hashOpaqueToken(token), client);
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      return null;
    }
    return { userId: record.userId, expiresAt: record.expiresAt };
  },

  /**
   * Consumes a presented token atomically and returns whose it was, or
   * `null` if it wasn't usable (same collapse as `findValid`). Pass the
   * transaction that performs the change the token authorizes: if that
   * change rolls back, the token stays unused.
   */
  async consume(purpose: AccountTokenPurpose, token: string, client: DbClient = prisma): Promise<{ userId: string } | null> {
    const record = await accountTokensRepository.findByHash(purpose, hashOpaqueToken(token), client);
    if (!record) {
      return null;
    }
    const won = await accountTokensRepository.markUsedIfUsable(purpose, record.id, new Date(), client);
    return won ? { userId: record.userId } : null;
  },

  /** Burns every still-unused token of this purpose for the user, e.g. so an older reset link dies once a newer one was used. */
  async invalidateOutstanding(purpose: AccountTokenPurpose, userId: string, client: DbClient = prisma): Promise<void> {
    await accountTokensRepository.markAllUnusedAsUsed(purpose, userId, new Date(), client);
  },
};
