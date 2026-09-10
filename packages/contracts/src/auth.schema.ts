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
