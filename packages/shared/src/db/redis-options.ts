import type { RedisOptions } from 'ioredis';

/**
 * How long a single Redis command may take before it is rejected, and how
 * long a connection attempt may take before it is abandoned.
 *
 * These exist so an unreachable Redis turns into a fast error instead of a
 * hang. ioredis queues commands issued while the socket is down (its
 * "offline queue") and retries the connection forever, so without a command
 * timeout a request that touches Redis -- the rate limiter on
 * POST /v1/auth/register, for one -- waits for as long as the outage lasts.
 * Disabling the offline queue instead is not an option: `redis` below is
 * `lazyConnect`, so its very first command is always issued before the
 * socket is ready and would be rejected outright.
 *
 * Five seconds is well above a healthy round trip to a managed Redis in
 * another region (single-digit milliseconds) and well below any HTTP client's
 * patience.
 */
export const REDIS_COMMAND_TIMEOUT_MS = 5_000;
export const REDIS_CONNECT_TIMEOUT_MS = 5_000;

/**
 * Whether a connection URL asks for TLS, i.e. uses the `rediss://` scheme
 * (Upstash and most managed providers require it).
 *
 * ioredis already derives TLS from a `rediss://` URL passed as a string, but
 * only by matching the lowercase prefix, and only as long as the URL keeps
 * being handed to it whole. Deciding it here instead means the answer is
 * explicit, case-insensitive, and testable without opening a socket -- and
 * that splitting a URL into host/port/password somewhere down the line can no
 * longer silently drop TLS and downgrade production to a plaintext socket.
 */
export function isSecureRedisUrl(url: string): boolean {
  return /^rediss:\/\//i.test(url.trim());
}

/**
 * The ioredis options every connection in the monorepo is built with.
 * `overrides` wins, so a caller can still say `maxRetriesPerRequest: null`
 * (BullMQ requires it) or drop `commandTimeout` (a BullMQ Worker's blocking
 * commands are supposed to sit and wait).
 */
export function buildRedisOptions(url: string, overrides: RedisOptions = {}): RedisOptions {
  return {
    ...(isSecureRedisUrl(url) ? { tls: {} } : {}),
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    ...overrides,
  };
}
