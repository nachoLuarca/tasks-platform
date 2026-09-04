import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';

import { config } from '../../src/shared/config/index.js';

const secretKey = new TextEncoder().encode(config.auth.jwtSecret);

/** Builds a token with the same shape `signAccessToken` issues, but expired. */
export async function signExpiredAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
    .setIssuer('tasks-platform')
    .setAudience('tasks-platform-clients')
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(secretKey);
}
