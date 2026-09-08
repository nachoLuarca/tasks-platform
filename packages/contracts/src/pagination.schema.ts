import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/**
 * Every list endpoint accepts the same cursor + limit pair. The cursor is
 * opaque to the client: it is whatever `nextCursor` came back in the
 * previous page, never something the client constructs by hand.
 */
export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional().default(DEFAULT_PAGE_LIMIT),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Same envelope for every paginated list: the page of data, and the cursor for the next one (null when there isn't one). */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
