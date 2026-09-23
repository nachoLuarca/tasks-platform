import { Redis, type RedisOptions } from 'ioredis';

import { sharedConfig } from '../config/index.js';
import { createLogger } from '../logger/index.js';
import { buildRedisOptions } from './redis-options.js';

const logger = createLogger();

/**
 * Single Redis connection shared by the whole process. Lazy-connects so the
 * app can still start and report readiness failures instead of crashing, and
 * bounded by `commandTimeout` (see redis-options.ts) so a command issued
 * while Redis is unreachable fails in seconds instead of waiting out the
 * whole outage in ioredis's offline queue.
 */
export const redis = new Redis(
  sharedConfig.redis.url,
  buildRedisOptions(sharedConfig.redis.url, { lazyConnect: true, maxRetriesPerRequest: 1 }),
);

redis.on('error', (error: Error) => {
  logger.error({ err: error }, 'Redis connection error');
});

/**
 * BullMQ requires its own connection with `maxRetriesPerRequest: null`
 * (it manages retries itself for blocking commands) -- a separate ioredis
 * instance from the general-purpose `redis` client above, which callers
 * (rate limiting in the api) rely on failing fast instead of retrying
 * forever. Shared by every Queue/Worker in both processes.
 *
 * `commandTimeout` is deliberately off by default: a BullMQ Worker fetches
 * jobs with blocking commands (BZPOPMIN and friends) that are *supposed* to
 * sit on the socket for seconds at a time, and a command timeout would abort
 * them mid-wait. Producers, which only ever issue ordinary commands, opt back
 * in -- see `sharedConnection` in ../queues/queues.ts.
 */
export function createQueueConnection(overrides: RedisOptions = {}): Redis {
  return new Redis(
    sharedConfig.redis.url,
    buildRedisOptions(sharedConfig.redis.url, {
      maxRetriesPerRequest: null,
      commandTimeout: undefined,
      ...overrides,
    }),
  );
}
