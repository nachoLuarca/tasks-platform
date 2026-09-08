import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { ValidationError } from '../errors/index.js';

/**
 * Parses `req.query` with the given schema, replacing it with the parsed
 * (and coerced/defaulted, e.g. `limit` as a number) value. Same pattern as
 * `validateBody`, but for query strings.
 */
export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError('Invalid query parameters', result.error.flatten()));
      return;
    }
    req.query = result.data as unknown as typeof req.query;
    next();
  };
}
