import { z } from 'zod';

import { emailSchema } from './common.schema.js';
import { roleSchema } from './roles.schema.js';

export const createInvitationRequestSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const invitationResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: roleSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type InvitationResponse = z.infer<typeof invitationResponseSchema>;

export const invitationListResponseSchema = z.array(invitationResponseSchema);
export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;

/**
 * The invitation link used to come back in this response (Phase 2 -> Phase
 * 4 gap, see docs/DEBT.md, now closed): creating an invitation queues a real
 * email instead (see invitations.service.ts), so this response carries
 * nothing beyond the invitation itself.
 */
export const createInvitationResponseSchema = invitationResponseSchema;
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;

/** Public preview: only what's needed to decide whether to accept. */
export const invitationPreviewResponseSchema = z.object({
  organizationName: z.string(),
  invitedByName: z.string(),
  role: roleSchema,
});
export type InvitationPreviewResponse = z.infer<typeof invitationPreviewResponseSchema>;
