import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './pagination.schema.js';

export const taskActivityTypeSchema = z.enum([
  'TASK_CREATED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'ASSIGNEE_CHANGED',
  'DUE_DATE_CHANGED',
  'TITLE_CHANGED',
  'LABELS_CHANGED',
  'COMMENT_ADDED',
]);
export type TaskActivityType = z.infer<typeof taskActivityTypeSchema>;

/**
 * Exactly one of the two shapes: a human actor (a JWT-authenticated user) or
 * a machine actor (an API key), never both -- see the `TaskActivity` model
 * comment in schema.prisma (Phase 4, PHASE.md decision 9). Never carries the
 * key's secret or its hash, only what identifies it in a listing.
 */
export const taskActivityActorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('USER'), id: z.string().uuid(), name: z.string(), email: z.string().email() }),
  z.object({ type: z.literal('API_KEY'), id: z.string().uuid(), name: z.string(), prefix: z.string() }),
]);
export type TaskActivityActor = z.infer<typeof taskActivityActorSchema>;

export const taskActivityResponseSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  actor: taskActivityActorSchema,
  type: taskActivityTypeSchema,
  changes: z.object({ before: z.unknown(), after: z.unknown() }),
  createdAt: z.string().datetime(),
});
export type TaskActivityResponse = z.infer<typeof taskActivityResponseSchema>;

export const taskActivityListQuerySchema = paginationQuerySchema;
export type TaskActivityListQuery = z.infer<typeof taskActivityListQuerySchema>;

export const taskActivityListResponseSchema = paginatedResponseSchema(taskActivityResponseSchema);
export type TaskActivityListResponse = z.infer<typeof taskActivityListResponseSchema>;
