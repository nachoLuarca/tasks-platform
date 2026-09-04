import type { Request, RequestHandler } from 'express';

import type {
  AuthSessionResponse,
  LoginRequest,
  RefreshResponse,
  RegisterRequest,
} from '@tasks-platform/contracts';

import { UnauthorizedError } from '../../shared/errors/index.js';
import { usersService } from '../users/users.service.js';
import { toUserProfile } from '../users/users.mapper.js';
import type { RequestMeta } from './auth.service.js';
import { authService } from './auth.service.js';
import { clearRefreshTokenCookie, readRefreshTokenCookie, setRefreshTokenCookie } from './cookies.js';

function getRequestMeta(req: Request): RequestMeta {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };
}

/** Only ever called on routes behind `requireAuth`, which always sets this. */
function getAuthenticatedUserId(req: Request): string {
  if (!req.auth) {
    throw new UnauthorizedError('Missing authentication context');
  }
  return req.auth.userId;
}

export const authController = {
  register: (async (req, res) => {
    const body = req.body as RegisterRequest;
    const { user, session } = await authService.register(body, getRequestMeta(req));

    setRefreshTokenCookie(res, session.refreshToken);
    const response: AuthSessionResponse = {
      user: toUserProfile(user),
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
    };
    res.status(201).json(response);
  }) satisfies RequestHandler,

  login: (async (req, res) => {
    const body = req.body as LoginRequest;
    const { user, session } = await authService.login(body, getRequestMeta(req));

    setRefreshTokenCookie(res, session.refreshToken);
    const response: AuthSessionResponse = {
      user: toUserProfile(user),
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
    };
    res.status(200).json(response);
  }) satisfies RequestHandler,

  refresh: (async (req, res) => {
    const presentedToken = readRefreshTokenCookie(req);
    if (!presentedToken) {
      throw new UnauthorizedError('Missing refresh token');
    }

    const session = await authService.refresh(presentedToken, getRequestMeta(req));

    setRefreshTokenCookie(res, session.refreshToken);
    const response: RefreshResponse = {
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
    };
    res.status(200).json(response);
  }) satisfies RequestHandler,

  logout: (async (req, res) => {
    const presentedToken = readRefreshTokenCookie(req);
    if (presentedToken) {
      await authService.logout(presentedToken);
    }
    clearRefreshTokenCookie(res);
    res.status(204).send();
  }) satisfies RequestHandler,

  logoutAll: (async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    await authService.logoutAll(userId);
    clearRefreshTokenCookie(res);
    res.status(204).send();
  }) satisfies RequestHandler,

  me: (async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const user = await usersService.getById(userId);
    res.status(200).json(toUserProfile(user));
  }) satisfies RequestHandler,
};
