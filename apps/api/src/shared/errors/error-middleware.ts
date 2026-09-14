import type { ErrorRequestHandler, RequestHandler } from 'express';

import { redactTokenPaths } from '../http/redact-token-paths.js';
import { getRequestId, logger } from '../logger/index.js';
import { NotFoundError, TooManyRequestsError } from './app-error.js';
import { toProblemDetails } from './problem-details.js';

/** The path ends up in both the response and the warn log below, so token segments are masked first. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${redactTokenPaths(req.originalUrl)} does not exist`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const problem = toProblemDetails(error, getRequestId());

  if (problem.status >= 500) {
    logger.error({ err: error }, 'Unhandled error');
  } else {
    logger.warn(
      { err: { name: (error as Error).name, message: (error as Error).message } },
      'Request failed',
    );
  }

  if (error instanceof TooManyRequestsError) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }

  res.status(problem.status).contentType('application/problem+json').send(problem);
};
