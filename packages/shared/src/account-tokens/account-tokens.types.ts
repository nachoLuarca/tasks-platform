/**
 * The two kinds of single-use account token. Each purpose maps to its own
 * table (VerificationToken / PasswordResetToken) and its own lifetime -- see
 * ACCOUNT_TOKEN_TTL_MS in account-tokens.service.ts.
 */
export type AccountTokenPurpose = 'email-verification' | 'password-reset';

export interface AccountTokenEntity {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface CreateAccountTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Returned only to the caller that issued the token, so it can put it in an email. Never persisted, never logged. */
export interface IssuedAccountToken {
  token: string;
  expiresAt: Date;
}
