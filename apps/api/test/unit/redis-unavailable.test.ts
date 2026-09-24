import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterEach, describe, expect, it } from 'vitest';

import { toProblemDetails } from '../../src/shared/errors/problem-details.js';

// Nothing listens on port 1, so every connection attempt is refused at once.
const UNREACHABLE = 'redis://127.0.0.1:1';

const clients: Redis[] = [];

function client(options: ConstructorParameters<typeof Redis>[1]): Redis {
  const redis = new Redis(UNREACHABLE, { lazyConnect: true, ...options });
  redis.on('error', () => {});
  clients.push(redis);
  return redis;
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the command to fail');
}

afterEach(() => {
  clients.splice(0).forEach((redis) => redis.disconnect());
});

/**
 * The errors come from the real ioredis, not hand-built lookalikes: the
 * matching in problem-details.ts is by name and message, and this is what
 * catches an upgrade that changes either.
 */
describe('Redis unreachable', () => {
  it('renders a spent retry budget as 503 Problem Details', async () => {
    const error = await rejectionOf(client({ maxRetriesPerRequest: 1 }).get('key'));

    expect(toProblemDetails(error, undefined)).toMatchObject({
      type: 'https://tasks-platform.dev/errors/service-unavailable',
      status: 503,
    });
  });

  it('renders a command timeout as 503 Problem Details', async () => {
    // How a BullMQ producer fails: it retries forever, only commandTimeout stops it.
    const error = await rejectionOf(client({ maxRetriesPerRequest: null, commandTimeout: 200 }).get('key'));

    expect(toProblemDetails(error, undefined).status).toBe(503);
  });

  it('renders a closed connection as 503 Problem Details', async () => {
    const redis = client({});
    redis.disconnect();

    const error = await rejectionOf(redis.get('key'));

    expect(toProblemDetails(error, undefined).status).toBe(503);
  });

  it('lets a BullMQ producer fail within seconds instead of waiting for the connection', async () => {
    // Mirrors packages/shared/src/queues/queues.ts's producerOptions(): without
    // skipWaitingForReady, add() waits for a 'ready' that never comes.
    const queue = new Queue('probe', {
      connection: client({ maxRetriesPerRequest: null, commandTimeout: 200 }),
      skipWaitingForReady: true,
    });
    queue.on('error', () => {});
    const startedAt = Date.now();

    try {
      const error = await rejectionOf(queue.add('probe', {}));

      expect(Date.now() - startedAt).toBeLessThan(3_000);
      expect(toProblemDetails(error, undefined).status).toBe(503);
    } finally {
      await queue.close();
    }
  });

  it('still renders an unrelated error as 500', () => {
    expect(toProblemDetails(new Error('boom'), undefined).status).toBe(500);
  });
});
