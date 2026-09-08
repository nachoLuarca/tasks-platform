import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './pagination.schema.js';

export const projectStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** 2 to 5 uppercase letters, e.g. "ENG", "WEB", "OPS". Unique per organization. */
export const projectKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2,5}$/, 'Key must be 2 to 5 uppercase letters');

export const createProjectRequestSchema = z.object({
  key: projectKeySchema,
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).optional(),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

export const projectListQuerySchema = paginationQuerySchema.extend({
  status: projectStatusSchema.optional(),
});
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export const projectResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  taskCounter: z.number().int(),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectListResponseSchema = paginatedResponseSchema(projectResponseSchema);
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
