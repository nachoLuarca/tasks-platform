import { Redis } from 'ioredis';

import { config } from '../config/index.js';
import { logger } from '../logger/index.js';

/**
 * Single Redis connection shared by the whole process. Lazy-connects so the
 * app can still start and report readiness failures instead of crashing.
 */
export const redis = new Redis(config.redis.url, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

redis.on('error', (error: Error) => {
  logger.error({ err: error }, 'Redis connection error');
});
