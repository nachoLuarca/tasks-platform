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

export const taskActivityResponseSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  actorId: z.string().uuid(),
  type: taskActivityTypeSchema,
  changes: z.object({ before: z.unknown(), after: z.unknown() }),
  createdAt: z.string().datetime(),
});
export type TaskActivityResponse = z.infer<typeof taskActivityResponseSchema>;

export const taskActivityListQuerySchema = paginationQuerySchema;
export type TaskActivityListQuery = z.infer<typeof taskActivityListQuerySchema>;

export const taskActivityListResponseSchema = paginatedResponseSchema(taskActivityResponseSchema);
export type TaskActivityListResponse = z.infer<typeof taskActivityListResponseSchema>;
