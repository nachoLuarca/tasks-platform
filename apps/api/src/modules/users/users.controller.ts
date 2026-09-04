import type { RequestHandler } from 'express';

import type { ChangePasswordRequest, UpdateProfileRequest } from '@tasks-platform/contracts';

import { UnauthorizedError } from '../../shared/errors/index.js';
import { authService } from '../auth/auth.service.js';
import { readRefreshTokenCookie } from '../auth/cookies.js';
import { toUserProfile } from './users.mapper.js';
import { usersService } from './users.service.js';

function getAuthenticatedUserId(req: { auth?: { userId: string } }): string {
  if (!req.auth) {
    throw new UnauthorizedError('Missing authentication context');
  }
  return req.auth.userId;
}

export const usersController = {
  updateProfile: (async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const body = req.body as UpdateProfileRequest;
    const user = await usersService.updateName(userId, body.name);
    res.status(200).json(toUserProfile(user));
  }) satisfies RequestHandler,

  changePassword: (async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const body = req.body as ChangePasswordRequest;

    await usersService.changePassword(userId, body.currentPassword, body.newPassword);

    const currentRefreshToken = readRefreshTokenCookie(req);
    await authService.revokeOtherSessions(userId, currentRefreshToken);

    res.status(204).send();
  }) satisfies RequestHandler,
};
