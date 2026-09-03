import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

import { requestContextStorage } from '../logger/index.js';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Assigns a requestId to every request (reusing an inbound one if present),
 * exposes it on the response header, and makes it available to any log
 * emitted downstream via AsyncLocalStorage.
 */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  requestContextStorage.run({ requestId }, next);
};
