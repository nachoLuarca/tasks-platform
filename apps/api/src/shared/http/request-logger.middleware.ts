import type { IncomingMessage } from 'node:http';

import { pinoHttp } from 'pino-http';

import { logger } from '../logger/index.js';

const IGNORED_PATHS = new Set(['/health/live', '/health/ready']);

/**
 * Access log for every request except the health-check endpoints, which are
 * polled constantly and would otherwise drown the log output.
 */
export const requestLoggerMiddleware = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage) => req.id,
  autoLogging: {
    ignore: (req: IncomingMessage) => IGNORED_PATHS.has(req.url ?? ''),
  },
});
