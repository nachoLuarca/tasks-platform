import type { ErrorRequestHandler, RequestHandler } from 'express';

import { redactTokenPaths } from '../http/redact-token-paths.js';
import { getRequestId, logger } from '../logger/index.js';
import { AppError, NotFoundError, TooManyRequestsError, ValidationError } from './app-error.js';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: unknown;
}

function toProblemDetails(error: unknown): ProblemDetails {
  const instance = getRequestId();

  if (error instanceof AppError) {
    return {
      type: error.type,
      title: error.title,
      status: error.status,
      detail: error.detail,
      instance,
      errors: error instanceof ValidationError ? error.errors : undefined,
    };
  }

  return {
    type: 'https://tasks-platform.dev/errors/internal',
    title: 'Internal Server Error',
    status: 500,
    instance,
  };
}

/** The path ends up in both the response and the warn log below, so token segments are masked first. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${redactTokenPaths(req.originalUrl)} does not exist`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const problem = toProblemDetails(error);

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
