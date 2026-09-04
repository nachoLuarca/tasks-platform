import type { Request, Response } from 'express';

import { config } from '../../shared/config/index.js';
import { REFRESH_TOKEN_TTL_DAYS } from '../../shared/security/index.js';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
// Scoped to the API, not just /v1/auth: POST /v1/users/me/password also
// needs to read it, to know which session is "the one making the request"
// and exclude it when revoking the user's other sessions.
const REFRESH_TOKEN_COOKIE_PATH = '/v1';

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.auth.cookieSameSite,
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.auth.cookieSameSite,
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
}

/**
 * Express doesn't parse cookies without the `cookie-parser` middleware, and
 * pulling in a dependency for one value isn't worth it: this reads the
 * single cookie we ever set.
 */
export function readRefreshTokenCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const name = part.slice(0, separatorIndex).trim();
    if (name === REFRESH_TOKEN_COOKIE) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }

  return undefined;
}
