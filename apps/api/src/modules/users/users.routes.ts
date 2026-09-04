import { Router } from 'express';

import { changePasswordRequestSchema, updateProfileRequestSchema } from '@tasks-platform/contracts';

import { validateBody } from '../../shared/http/index.js';
import { requireAuth } from '../auth/require-auth.middleware.js';
import { usersController } from './users.controller.js';

export const usersRouter = Router();

usersRouter.patch(
  '/me',
  requireAuth,
  validateBody(updateProfileRequestSchema),
  usersController.updateProfile,
);

usersRouter.post(
  '/me/password',
  requireAuth,
  validateBody(changePasswordRequestSchema),
  usersController.changePassword,
);
