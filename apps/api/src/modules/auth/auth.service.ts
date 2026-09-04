import { randomUUID } from 'node:crypto';

import { prisma, type DbClient } from '../../shared/db/index.js';
import { ConflictError, UnauthorizedError } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import {
  dummyPasswordHash,
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_DAYS,
  signAccessToken,
  verifyPassword,
} from '../../shared/security/index.js';
import { organizationsService } from '../organizations/organizations.service.js';
import { usersRepository } from '../users/users.repository.js';
import { usersService } from '../users/users.service.js';
import type { UserEntity } from '../users/users.types.js';
import { authRepository } from './auth.repository.js';

export interface RequestMeta {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface IssuedSession {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  refreshTokenId: string;
}

function refreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function issueSession(
  userId: string,
  familyId: string,
  meta: RequestMeta,
  client: DbClient = prisma,
): Promise<IssuedSession> {
  const [{ token: accessToken, expiresInSeconds }, refresh] = await Promise.all([
    signAccessToken(userId),
    Promise.resolve(generateRefreshToken()),
  ]);

  const created = await authRepository.createRefreshToken(
    {
      userId,
      tokenHash: refresh.tokenHash,
      familyId,
      expiresAt: refreshTokenExpiry(),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    },
    client,
  );

  return {
    accessToken,
    expiresInSeconds,
    refreshToken: refresh.token,
    refreshTokenId: created.id,
  };
}

export const authService = {
  async register(
    input: { email: string; password: string; name: string },
    meta: RequestMeta,
  ): Promise<{ user: UserEntity; session: IssuedSession }> {
    const existing = await usersRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('Email is already registered');
    }

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await usersService.createUser(input, tx);
      await organizationsService.createOrganization(`${input.name}'s organization`, createdUser.id, tx);
      return createdUser;
    });

    const session = await issueSession(user.id, randomUUID(), meta);
    return { user, session };
  },

  async login(
    input: { email: string; password: string },
    meta: RequestMeta,
  ): Promise<{ user: UserEntity; session: IssuedSession }> {
    const user = await usersRepository.findByEmail(input.email);
    const hashToCheck = user ? user.passwordHash : await dummyPasswordHash;
    const isPasswordValid = await verifyPassword(hashToCheck, input.password);

    if (!user || !isPasswordValid) {
      logger.warn({ email: input.email }, 'Login attempt failed');
      throw new UnauthorizedError('Invalid email or password');
    }

    const session = await issueSession(user.id, randomUUID(), meta);
    return { user, session };
  },

  async refresh(presentedToken: string, meta: RequestMeta): Promise<IssuedSession> {
    const tokenHash = hashRefreshToken(presentedToken);
    const record = await authRepository.findRefreshTokenByHash(tokenHash);

    if (!record) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (record.revokedAt) {
      await authRepository.revokeFamily(record.familyId);
      logger.warn(
        { userId: record.userId, familyId: record.familyId },
        'Refresh token reuse detected: revoking token family',
      );
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    return prisma.$transaction(async (tx) => {
      const session = await issueSession(record.userId, record.familyId, meta, tx);
      await authRepository.revokeAndReplace(record.id, session.refreshTokenId, tx);
      return session;
    });
  },

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(presentedToken);
    const record = await authRepository.findRefreshTokenByHash(tokenHash);

    if (record && !record.revokedAt) {
      await authRepository.revokeById(record.id);
    }
  },

  async logoutAll(userId: string): Promise<void> {
    await authRepository.revokeAllForUser(userId);
  },

  /** Used by password change: keeps the session making the request alive. */
  async revokeOtherSessions(userId: string, currentRefreshToken?: string): Promise<void> {
    let exceptId: string | undefined;

    if (currentRefreshToken) {
      const record = await authRepository.findRefreshTokenByHash(
        hashRefreshToken(currentRefreshToken),
      );
      exceptId = record?.id;
    }

    await authRepository.revokeAllForUser(userId, prisma, exceptId);
  },
};
