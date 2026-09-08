import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { verifyAccessToken } from '../../shared/security/index.js';
import { API_KEY_PREFIX } from '../api-keys/api-keys.types.js';
import { apiKeysService } from '../api-keys/api-keys.service.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * A single credential channel (the `Authorization: Bearer` header) carries
 * either a JWT access token or an API key, told apart by whether it starts
 * with the key's visible prefix (PHASE.md decision, Phase 4) -- there is no
 * separate header to configure or forget. Stateless for a JWT (trusted for
 * its whole 15-minute life, no database lookup); a lookup is unavoidable for
 * an API key since revocation must take effect immediately. The client only
 * ever sees a generic 401 either way - whether the credential was missing,
 * malformed, expired, revoked or forged makes no difference to the
 * response, only to the internal log.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const credential = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;

  if (!credential) {
    next(new UnauthorizedError('Missing access token'));
    return;
  }

  if (credential.startsWith(API_KEY_PREFIX)) {
    const result = await apiKeysService.authenticate(credential);
    if (!result.ok) {
      logger.info({ reason: result.reason }, 'API key rejected');
      next(new UnauthorizedError('Invalid, revoked or expired API key'));
      return;
    }
    req.auth = {
      type: 'apiKey',
      apiKeyId: result.apiKeyId,
      organizationId: result.organizationId,
      scopes: result.scopes,
    };
    next();
    return;
  }

  const result = await verifyAccessToken(credential);
  if (!result.ok) {
    logger.info({ reason: result.reason }, 'Access token rejected');
    next(new UnauthorizedError('Invalid or expired access token'));
    return;
  }

  req.auth = { type: 'user', userId: result.payload.sub };
  next();
};
