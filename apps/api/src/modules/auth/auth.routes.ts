import { Router } from 'express';

import { loginRequestSchema, registerRequestSchema } from '@tasks-platform/contracts';

import { createRateLimiter, validateBody } from '../../shared/http/index.js';
import { authController } from './auth.controller.js';
import { requireAuth } from './require-auth.middleware.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  createRateLimiter('register'),
  validateBody(registerRequestSchema),
  authController.register,
);

authRouter.post(
  '/login',
  createRateLimiter('login'),
  validateBody(loginRequestSchema),
  authController.login,
);

authRouter.post('/refresh', createRateLimiter('refresh'), authController.refresh);

authRouter.post('/logout', authController.logout);
authRouter.post('/logout-all', requireAuth, authController.logoutAll);
authRouter.get('/me', requireAuth, authController.me);
