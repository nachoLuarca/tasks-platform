import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { ValidationError } from '../errors/index.js';

/**
 * Parses `req.query` with the given schema, replacing it with the parsed
 * (and coerced/defaulted, e.g. `limit` as a number) value. Same pattern as
 * `validateBody`, but for query strings.
 *
 * Express 5 exposes `req.query` through a getter on the prototype (parsed
 * lazily from the URL), so a plain assignment throws "has only a getter" --
 * `Object.defineProperty` shadows it with an own, writable property instead.
 */
export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError('Invalid query parameters', result.error.flatten()));
      return;
    }
    Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    next();
  };
}
