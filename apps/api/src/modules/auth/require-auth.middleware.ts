import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { verifyAccessToken } from '../../shared/security/index.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * Stateless on purpose: the access token is trusted for its whole 15-minute
 * life, no database lookup. The client only ever sees a generic 401 -
 * whether the token was missing, malformed, expired, or forged makes no
 * difference to the response, only to the internal log.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;

  if (!token) {
    next(new UnauthorizedError('Missing access token'));
    return;
  }

  const result = await verifyAccessToken(token);
  if (!result.ok) {
    logger.info({ reason: result.reason }, 'Access token rejected');
    next(new UnauthorizedError('Invalid or expired access token'));
    return;
  }

  req.auth = { userId: result.payload.sub };
  next();
};
