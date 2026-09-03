import { z } from 'zod';

/**
 * Shared shape for health-check responses. Kept in contracts so the demo
 * frontend (added in a later phase) can rely on the same schema as the API.
 */
export const dependencyStatusSchema = z.enum(['ok', 'error']);

export const readinessResponseSchema = z.object({
  status: dependencyStatusSchema,
  dependencies: z.object({
    database: dependencyStatusSchema,
    redis: dependencyStatusSchema,
  }),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
