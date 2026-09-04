import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { ValidationError } from '../errors/index.js';

/**
 * Parses `req.body` with the given schema, replacing it with the parsed
 * (and normalized, e.g. lowercased email) value. Controllers can then trust
 * the shape without re-validating.
 */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError('Invalid request body', result.error.flatten()));
      return;
    }
    req.body = result.data;
    next();
  };
}
