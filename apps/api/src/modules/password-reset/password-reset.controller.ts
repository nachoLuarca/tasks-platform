import type { Request, RequestHandler } from 'express';

import { accountTokenSchema, type ForgotPasswordRequest, type ResetPasswordRequest } from '@tasks-platform/contracts';

import { NotFoundError } from '../../shared/errors/index.js';
import { clearRefreshTokenCookie } from '../auth/cookies.js';
import { FORGOT_PASSWORD_RESPONSE, toResetPasswordTokenStatusResponse } from './password-reset.mapper.js';
import { passwordResetService } from './password-reset.service.js';

/** A malformed token can't be a valid one: same 404 as an unknown token, without touching the service. */
function getTokenParam(req: Request): string {
  const parsed = accountTokenSchema.safeParse(req.params.token);
  if (!parsed.success) {
    throw new NotFoundError('Invalid or expired password reset token');
  }
  return parsed.data;
}

export const passwordResetController = {
  /** Always 202 with the same constant body -- see FORGOT_PASSWORD_RESPONSE and passwordResetService.requestReset. */
  forgotPassword: (async (req, res) => {
    const body = req.body as ForgotPasswordRequest;
    await passwordResetService.requestReset(body.email);
    res.status(202).json(FORGOT_PASSWORD_RESPONSE);
  }) satisfies RequestHandler,

  checkToken: (async (req, res) => {
    const status = await passwordResetService.checkToken(getTokenParam(req));
    res.status(200).json(toResetPasswordTokenStatusResponse(status));
  }) satisfies RequestHandler,

  /**
   * Every session is revoked server-side; the refresh cookie this browser may
   * still hold is cleared too, since it now points at a revoked token.
   */
  resetPassword: (async (req, res) => {
    const body = req.body as ResetPasswordRequest;
    await passwordResetService.resetPassword(body.token, body.newPassword);
    clearRefreshTokenCookie(res);
    res.status(204).send();
  }) satisfies RequestHandler,
};
