import { z } from 'zod';

import { nameSchema, passwordSchema } from './common.schema.js';

export const updateProfileRequestSchema = z.object({
  name: nameSchema,
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
