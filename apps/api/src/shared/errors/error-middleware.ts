import type { ErrorRequestHandler, RequestHandler } from 'express';

import { getRequestId, logger } from '../logger/index.js';
import { AppError, NotFoundError, ValidationError } from './app-error.js';

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

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} does not exist`));
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

  res.status(problem.status).contentType('application/problem+json').send(problem);
};
