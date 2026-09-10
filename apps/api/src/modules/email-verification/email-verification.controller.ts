import type { RequestHandler } from 'express';

import type { VerifyEmailRequest } from '@tasks-platform/contracts';

import { requireUserId } from '../../shared/authorization/index.js';
import { emailVerificationService } from './email-verification.service.js';

export const emailVerificationController = {
  verify: (async (req, res) => {
    const body = req.body as VerifyEmailRequest;
    await emailVerificationService.verify(body.token);
    res.status(204).send();
  }) satisfies RequestHandler,

  /** 202: the email is queued, not sent yet. The response never carries the token or the link. */
  resend: (async (req, res) => {
    const userId = requireUserId(req);
    await emailVerificationService.resend(userId);
    res.status(202).send();
  }) satisfies RequestHandler,
};
