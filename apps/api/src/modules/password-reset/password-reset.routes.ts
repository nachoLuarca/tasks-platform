import { Router } from 'express';

import { forgotPasswordRequestSchema, resetPasswordRequestSchema } from '@tasks-platform/contracts';

import { createRateLimiter, validateBody } from '../../shared/http/index.js';
import { passwordResetController } from './password-reset.controller.js';

/**
 * Mounted at /v1/auth, next to authRouter. All three routes are public and
 * rate limited per IP. The per-address limit on reset emails lives in the
 * worker instead, where it can be applied without the api ever learning
 * whether the address belongs to an account -- a per-address 429 here would
 * itself reveal that.
 */
export const passwordResetRouter = Router();

passwordResetRouter.post(
  '/forgot-password',
  createRateLimiter('forgot-password'),
  validateBody(forgotPasswordRequestSchema),
  passwordResetController.forgotPassword,
);

// The token rides in the path here (PHASE.md fixes this route's shape), so
// the access log redacts it -- see shared/http/redact-token-paths.ts.
passwordResetRouter.get('/reset-password/:token', createRateLimiter('reset-password-check'), passwordResetController.checkToken);

passwordResetRouter.post(
  '/reset-password',
  createRateLimiter('reset-password'),
  validateBody(resetPasswordRequestSchema),
  passwordResetController.resetPassword,
);
