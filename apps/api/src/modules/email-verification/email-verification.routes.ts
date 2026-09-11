import { Router } from 'express';

import { verifyEmailRequestSchema } from '@tasks-platform/contracts';

import { createRateLimiter, validateBody } from '../../shared/http/index.js';
import { requireAuth } from '../auth/require-auth.middleware.js';
import { emailVerificationController } from './email-verification.controller.js';

/**
 * Mounted at /v1/auth, next to authRouter. Verifying is public -- the token
 * is the proof, and the link may well be opened on a device with no session
 * -- and rate limited per IP like the rest of /v1/auth. Resending needs a
 * session and has its own per-account limit in the service.
 */
export const emailVerificationRouter = Router();

emailVerificationRouter.post(
  '/verify-email',
  createRateLimiter('verify-email'),
  validateBody(verifyEmailRequestSchema),
  emailVerificationController.verify,
);

emailVerificationRouter.post('/resend-verification', requireAuth, emailVerificationController.resend);
