import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './pagination.schema.js';

export const createCommentRequestSchema = z.object({
  body: z.string().trim().min(1, 'Body is required').max(5000),
});
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

export const updateCommentRequestSchema = z.object({
  body: z.string().trim().min(1, 'Body is required').max(5000),
});
export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>;

export const commentResponseSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  authorId: z.string().uuid(),
  author: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }),
  body: z.string(),
  editedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CommentResponse = z.infer<typeof commentResponseSchema>;

export const commentListQuerySchema = paginationQuerySchema;
export type CommentListQuery = z.infer<typeof commentListQuerySchema>;

export const commentListResponseSchema = paginatedResponseSchema(commentResponseSchema);
export type CommentListResponse = z.infer<typeof commentListResponseSchema>;
