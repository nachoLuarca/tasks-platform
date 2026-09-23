import {
  buildRedisOptions,
  createQueueConnection,
  emailQueue,
  isSecureRedisUrl,
  passwordResetRequestQueue,
  redis,
  REDIS_COMMAND_TIMEOUT_MS,
  webhookDeliveryQueue,
} from '@tasks-platform/shared';
import { describe, expect, it } from 'vitest';

/**
 * Lives here, next to the webhook-signature test, for the same reason:
 * packages/shared has no test runner of its own, and these are pure
 * functions -- no socket is opened, so the assertions hold with no Redis
 * anywhere in sight.
 *
 * What these guard is the production incident this file was written for: a
 * `rediss://` URL that ends up on a plaintext TCP socket, which Upstash
 * closes on sight (ECONNRESET in TCP.onStreamRead, never in TLSSocket).
 */
describe('redis connection options', () => {
  it('asks for TLS when the URL uses the rediss:// scheme', () => {
    const options = buildRedisOptions('rediss://default:secret@eu1-example.upstash.io:6379');

    expect(options.tls).toEqual({});
  });

  it('does not ask for TLS when the URL uses the plain redis:// scheme', () => {
    const options = buildRedisOptions('redis://localhost:6379');

    expect(options.tls).toBeUndefined();
  });

  it('recognises the rediss:// scheme regardless of case or surrounding whitespace', () => {
    expect(isSecureRedisUrl('REDISS://default:secret@eu1-example.upstash.io:6379')).toBe(true);
    expect(isSecureRedisUrl('  rediss://default:secret@eu1-example.upstash.io:6379  ')).toBe(true);
    expect(isSecureRedisUrl('redis://localhost:6379')).toBe(false);
    // A password that merely starts with the scheme name must not count.
    expect(isSecureRedisUrl('redis://user:rediss://@localhost:6379')).toBe(false);
  });

  it('keeps TLS while letting a caller override the rest', () => {
    const options = buildRedisOptions('rediss://default:secret@eu1-example.upstash.io:6379', {
      maxRetriesPerRequest: null,
      commandTimeout: undefined,
    });

    expect(options.tls).toEqual({});
    expect(options.maxRetriesPerRequest).toBeNull();
    expect(options.commandTimeout).toBeUndefined();
  });

  it('bounds every command by default so an unreachable Redis fails fast', () => {
    const options = buildRedisOptions('redis://localhost:6379');

    expect(options.commandTimeout).toBe(REDIS_COMMAND_TIMEOUT_MS);
    expect(options.connectTimeout).toBeGreaterThan(0);
  });

  // The builder is only worth anything if the real connections go through
  // it, so these assert the wiring rather than the function.
  it('builds the shared client through the builder, with its commands bounded', () => {
    expect(redis.options.commandTimeout).toBe(REDIS_COMMAND_TIMEOUT_MS);
    expect(redis.options.connectTimeout).toBeGreaterThan(0);
  });

  it('lets producer queues skip the wait for a ready connection, so an outage fails fast', async () => {
    for (const queue of [emailQueue(), passwordResetRequestQueue(), webhookDeliveryQueue()]) {
      try {
        expect(queue.opts.skipWaitingForReady).toBe(true);
      } finally {
        await queue.close();
      }
    }
  });

  it("leaves a queue connection's blocking commands unbounded, as BullMQ needs", () => {
    const connection = createQueueConnection();

    try {
      // BullMQ refuses to run with anything else here.
      expect(connection.options.maxRetriesPerRequest).toBeNull();
      // A Worker blocks on BZPOPMIN for seconds at a time by design.
      expect(connection.options.commandTimeout).toBeUndefined();
    } finally {
      connection.disconnect();
    }
  });
});
