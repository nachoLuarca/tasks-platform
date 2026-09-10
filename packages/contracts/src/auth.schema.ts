import { z } from 'zod';

import { emailSchema, nameSchema, passwordSchema } from './common.schema.js';

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** An opaque single-use account token (verification or password reset), as pasted from an email link. Shape only -- validity is the API's call. */
export const accountTokenSchema = z.string().trim().min(1, 'Token is required').max(512);

export const verifyEmailRequestSchema = z.object({
  token: accountTokenSchema,
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/** Identical for a registered and an unregistered address -- by design, see docs/adr/0011-account-recovery.md. */
export const forgotPasswordResponseSchema = z.object({
  message: z.string(),
});
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;

export const resetPasswordRequestSchema = z.object({
  token: accountTokenSchema,
  newPassword: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/** Only ever returned for a usable token; an unknown, used or expired one is a 404. */
export const resetPasswordTokenStatusResponseSchema = z.object({
  valid: z.literal(true),
  expiresAt: z.string().datetime(),
});
export type ResetPasswordTokenStatusResponse = z.infer<typeof resetPasswordTokenStatusResponseSchema>;

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  name: nameSchema,
  emailVerifiedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const authSessionResponseSchema = z.object({
  user: userProfileSchema,
  accessToken: z.string(),
  expiresInSeconds: z.number().int().positive(),
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  expiresInSeconds: z.number().int().positive(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
