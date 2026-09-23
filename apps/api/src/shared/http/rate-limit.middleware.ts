import type { RequestHandler } from 'express';

import { config } from '../config/index.js';
import { redis } from '../db/index.js';
import { ServiceUnavailableError, TooManyRequestsError } from '../errors/index.js';
import { logger } from '../logger/index.js';

/**
 * Fixed-window counter backed by Redis so the limit holds across instances.
 * Disabled entirely via RATE_LIMIT_ENABLED (tests turn it off).
 *
 * If Redis is unreachable the request is refused with 503, not waved through.
 * Letting it past would mean the limiter silently stops existing exactly when
 * it matters most: every route behind it is an unauthenticated credential
 * endpoint (register, login, refresh, password reset), so an outage would
 * open an unmetered window for credential stuffing. The commands here are
 * bounded by `commandTimeout` (packages/shared/src/db/redis-options.ts), so
 * this branch is reached within seconds rather than after the outage ends.
 */
export function createRateLimiter(bucket: string): RequestHandler {
  return async (req, _res, next) => {
    if (!config.rateLimit.enabled) {
      next();
      return;
    }

    const key = `ratelimit:${bucket}:${req.ip}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, config.rateLimit.windowMs);
      }

      if (count > config.rateLimit.maxAttempts) {
        const ttlMs = await redis.pttl(key);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((ttlMs > 0 ? ttlMs : config.rateLimit.windowMs) / 1000),
        );
        next(new TooManyRequestsError(retryAfterSeconds, 'Too many attempts, try again later'));
        return;
      }

      next();
    } catch (error) {
      logger.error({ err: error, bucket }, 'Rate limiter unavailable, refusing the request');
      next(new ServiceUnavailableError('The service is temporarily unavailable, try again shortly'));
    }
  };
}
