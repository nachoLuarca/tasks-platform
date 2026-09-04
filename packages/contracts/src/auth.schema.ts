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
