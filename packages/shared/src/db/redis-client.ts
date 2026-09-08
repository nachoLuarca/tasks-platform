import { Redis } from 'ioredis';

import { sharedConfig } from '../config/index.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger();

/** Single Redis connection shared by the whole process. Lazy-connects so the app can still start and report readiness failures instead of crashing. */
export const redis = new Redis(sharedConfig.redis.url, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

redis.on('error', (error: Error) => {
  logger.error({ err: error }, 'Redis connection error');
});

/**
 * BullMQ requires its own connection with `maxRetriesPerRequest: null`
 * (it manages retries itself for blocking commands) -- a separate ioredis
 * instance from the general-purpose `redis` client above, which callers
 * (rate limiting in the api) rely on failing fast instead of retrying
 * forever. Shared by every Queue/Worker in both processes.
 */
export function createQueueConnection(): Redis {
  return new Redis(sharedConfig.redis.url, { maxRetriesPerRequest: null });
}
