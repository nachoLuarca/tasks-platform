import { randomUUID } from 'node:crypto';

import { generateOpaqueToken, hashOpaqueToken } from '@tasks-platform/shared';
import { errors, jwtVerify, SignJWT } from 'jose';

import { config } from '../config/index.js';

const ISSUER = 'tasks-platform';
const AUDIENCE = 'tasks-platform-clients';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

const secretKey = new TextEncoder().encode(config.auth.jwtSecret);

export interface AccessTokenPayload {
  sub: string;
  jti: string;
}

export interface IssuedAccessToken {
  token: string;
  expiresInSeconds: number;
}

export async function signAccessToken(userId: string): Promise<IssuedAccessToken> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey);

  return { token, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS };
}

export type AccessTokenVerification =
  | { ok: true; payload: AccessTokenPayload }
  | { ok: false; reason: 'expired' | 'invalid' };

/**
 * The reason a token was rejected is only for internal logs (see callers).
 * The client always gets a generic 401 regardless of which branch matched.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenVerification> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
      return { ok: false, reason: 'invalid' };
    }

    return { ok: true, payload: { sub: payload.sub, jti: payload.jti } };
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }
}

export interface IssuedRefreshToken {
  token: string;
  tokenHash: string;
}

/**
 * SHA-256 of an opaque token. Only the hash is ever persisted (refresh
 * tokens, invitations, API keys). Delegates to packages/shared so the api
 * and the worker -- which issues password-reset tokens -- hash identically.
 */
export function hashToken(token: string): string {
  return hashOpaqueToken(token);
}

export function generateRefreshToken(): IssuedRefreshToken {
  return generateOpaqueToken();
}

export function hashRefreshToken(token: string): string {
  return hashToken(token);
}

export const INVITATION_TOKEN_TTL_DAYS = 7;

export interface IssuedInvitationToken {
  token: string;
  tokenHash: string;
}

export function generateInvitationToken(): IssuedInvitationToken {
  return generateOpaqueToken();
}
