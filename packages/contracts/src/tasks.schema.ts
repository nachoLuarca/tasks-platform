import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './pagination.schema.js';

export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const createTaskRequestSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000).optional(),
  priority: taskPrioritySchema.optional().default('MEDIUM'),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

/**
 * `version` is mandatory: this is the optimistic-locking check documented in
 * docs/adr/0007-optimistic-locking.md. Every other field is optional, since a
 * client may only want to change one of them.
 */
export const updateTaskRequestSchema = z
  .object({
    version: z.number().int().min(1),
    title: z.string().trim().min(1, 'Title is required').max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    dueDate: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 1, 'At least one field besides version is required');
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

export const assignTaskRequestSchema = z.object({
  userId: z.string().uuid(),
});
export type AssignTaskRequest = z.infer<typeof assignTaskRequestSchema>;

export const taskResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  number: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  assigneeId: z.string().uuid().nullable(),
  assignee: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }).nullable(),
  createdById: z.string().uuid(),
  dueDate: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;

export const taskSortBySchema = z.enum(['createdAt', 'dueDate', 'priority']);
export type TaskSortBy = z.infer<typeof taskSortBySchema>;

export const sortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof sortOrderSchema>;

/**
 * `unassigned=true` and `assigneeId` are mutually exclusive filters; if both
 * are sent, `assigneeId` wins (see tasks.service.ts).
 */
export const taskListQuerySchema = paginationQuerySchema.extend({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: z.string().uuid().optional(),
  unassigned: z.coerce.boolean().optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sortBy: taskSortBySchema.optional().default('createdAt'),
  sortOrder: sortOrderSchema.optional().default('desc'),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskListResponseSchema = paginatedResponseSchema(taskResponseSchema);
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;
