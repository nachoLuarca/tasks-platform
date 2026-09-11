import type { ForgotPasswordResponse, ResetPasswordTokenStatusResponse } from '@tasks-platform/contracts';

/**
 * The one and only body POST /v1/auth/forgot-password ever returns, for a
 * registered address and an unknown one alike. A constant, not something
 * computed per request, so the two cases can't drift apart.
 */
export const FORGOT_PASSWORD_RESPONSE: ForgotPasswordResponse = Object.freeze({
  message: 'If an account exists for that email address, a password reset link has been sent to it.',
});

export function toResetPasswordTokenStatusResponse(status: { expiresAt: Date }): ResetPasswordTokenStatusResponse {
  return { valid: true, expiresAt: status.expiresAt.toISOString() };
}
