import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './pagination.schema.js';

/** e.g. "#3B82F6". */
export const labelColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code like #3B82F6');

export const createLabelRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50),
  color: labelColorSchema,
});
export type CreateLabelRequest = z.infer<typeof createLabelRequestSchema>;

export const updateLabelRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(50).optional(),
    color: labelColorSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateLabelRequest = z.infer<typeof updateLabelRequestSchema>;

export const labelResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LabelResponse = z.infer<typeof labelResponseSchema>;

export const labelListQuerySchema = paginationQuerySchema;
export type LabelListQuery = z.infer<typeof labelListQuerySchema>;

export const labelListResponseSchema = paginatedResponseSchema(labelResponseSchema);
export type LabelListResponse = z.infer<typeof labelListResponseSchema>;

/** Replaces a task's entire label set in one call (PHASE.md decision under "Etiquetas"). */
export const setTaskLabelsRequestSchema = z.object({
  labelIds: z.array(z.string().uuid()).max(20),
});
export type SetTaskLabelsRequest = z.infer<typeof setTaskLabelsRequestSchema>;

export const taskLabelsResponseSchema = z.object({
  labels: z.array(labelResponseSchema),
});
export type TaskLabelsResponse = z.infer<typeof taskLabelsResponseSchema>;
