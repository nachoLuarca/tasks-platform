import { z } from 'zod';

export const createOrganizationRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
});
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;

export const updateOrganizationRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
});
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;

export const organizationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string().datetime(),
});
export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

export const organizationListResponseSchema = z.array(organizationResponseSchema);
export type OrganizationListResponse = z.infer<typeof organizationListResponseSchema>;
