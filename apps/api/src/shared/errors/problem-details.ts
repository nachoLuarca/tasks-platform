import type { ValidationProblemDetails } from '@tasks-platform/contracts';

import { AppError, ValidationError } from './app-error.js';

/**
 * Renders any thrown value as RFC 9457 Problem Details. Pure on purpose (no
 * logger, no config): the error middleware calls it for every real response,
 * and shared/openapi calls it to build the documented examples, so both come
 * out of the same code. The return type is the contracts schema the OpenAPI
 * document publishes -- a plain problem is that shape without `errors`.
 */
export function toProblemDetails(error: unknown, instance: string | undefined): ValidationProblemDetails {
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
