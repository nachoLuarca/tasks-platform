import { z } from 'zod';

import { roleSchema } from './roles.schema.js';

export const updateMemberRoleRequestSchema = z.object({
  role: roleSchema,
});
export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleRequestSchema>;

export const memberResponseSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  joinedAt: z.string().datetime(),
});
export type MemberResponse = z.infer<typeof memberResponseSchema>;

export const memberListResponseSchema = z.array(memberResponseSchema);
export type MemberListResponse = z.infer<typeof memberListResponseSchema>;

export const transferOwnershipRequestSchema = z.object({
  userId: z.string().uuid(),
});
export type TransferOwnershipRequest = z.infer<typeof transferOwnershipRequestSchema>;
