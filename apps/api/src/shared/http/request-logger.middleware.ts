import type { IncomingMessage } from 'node:http';

import { pinoHttp } from 'pino-http';

import { logger } from '../logger/index.js';
import { redactTokenPaths } from './redact-token-paths.js';

const IGNORED_PATHS = new Set(['/health/live', '/health/ready']);

/**
 * pino-http hands this the already-serialized request (method, url, query,
 * params, headers, ...). The url gets its token segments masked, and the
 * route params are dropped: for a route like /reset-password/:token they are
 * the token itself, and the redacted url already says which route it was.
 * Header redaction (authorization, cookie) stays in the shared logger.
 */
export const requestLogSerializers = {
  req: (req: { url: string; params?: unknown }) => {
    const { params: _params, ...rest } = req;
    return { ...rest, url: redactTokenPaths(req.url) };
  },
};

/**
 * Access log for every request except the health-check endpoints, which are
 * polled constantly and would otherwise drown the log output.
 */
export const requestLoggerMiddleware = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage) => req.id,
  serializers: requestLogSerializers,
  autoLogging: {
    ignore: (req: IncomingMessage) => IGNORED_PATHS.has(req.url ?? ''),
  },
});
