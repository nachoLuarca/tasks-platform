import type { ValidationProblemDetails } from '@tasks-platform/contracts';

import { AppError, ServiceUnavailableError, ValidationError } from './app-error.js';

/**
 * What ioredis rejects a command with when Redis can't be reached: its retry
 * budget ran out (the general-purpose client), the command outlived
 * `commandTimeout` (every client, see packages/shared/src/db/redis-options.ts),
 * or the connection was already closed. ioredis doesn't export these classes,
 * so they're matched by name and message; test/unit/redis-unavailable.test.ts
 * pins both against the real library so an upgrade that renames them fails
 * there instead of turning outages back into 500s.
 */
function isRedisUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'MaxRetriesPerRequestError' ||
      error.message === 'Command timed out' ||
      error.message === 'Connection is closed.')
  );
}

/**
 * A body that isn't parseable JSON never reaches a route handler: Express 5's
 * `express.json()` (body-parser) throws before any of ours runs. What it
 * throws is a plain `SyntaxError` decorated with `type: 'entity.parse.failed'`
 * and `status: 400` -- not an AppError, so without this it fell through to the
 * catch-all below and a typo in a request body came back as a 500, blaming the
 * server for the caller's mistake.
 *
 * Only the parse failure is matched here. The other body-parser types
 * (`entity.too.large`, `encoding.unsupported`, ...) are left alone on purpose:
 * each deserves its own status, and none of them is this bug.
 */
function isMalformedJsonBody(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    (error as SyntaxError & { type?: unknown }).type === 'entity.parse.failed'
  );
}

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

  if (isMalformedJsonBody(error)) {
    const problem = new ValidationError('The request body is not valid JSON');
    return {
      type: problem.type,
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      instance,
      errors: undefined,
    };
  }

  // A Redis outage is not a bug in this service: 503 tells the client to
  // retry later, which a 500 doesn't. Enqueueing an email (resend
  // verification, forgot password, invitations) fails this way.
  if (isRedisUnavailable(error)) {
    const problem = new ServiceUnavailableError('The service is temporarily unavailable, try again shortly');
    return {
      type: problem.type,
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      instance,
      errors: undefined,
    };
  }

  return {
    type: 'https://tasks-platform.dev/errors/internal',
    title: 'Internal Server Error',
    status: 500,
    instance,
  };
}
