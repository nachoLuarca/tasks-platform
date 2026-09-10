import pino, { type Logger, type LoggerOptions } from 'pino';

import { sharedConfig } from '../config/index.js';

/**
 * Every process builds its pino logger through this factory so the level,
 * redaction rules and pretty-printing (in development) never drift between
 * the api and the worker. Callers layer their own bindings/mixin on top --
 * e.g. apps/api injects the current requestId, apps/worker injects the
 * current jobId -- by passing `options`.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return pino({
    level: sharedConfig.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        'req.body',
        '*.password',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.passwordHash',
        '*.secret',
        '*.apiKey',
        '*.keyHash',
        '*.tokenHash',
      ],
      remove: true,
    },
    transport: sharedConfig.isDevelopment
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        }
      : undefined,
    ...options,
  });
}
