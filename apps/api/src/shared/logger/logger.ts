import pino from 'pino';

import { config } from '../config/index.js';
import { getRequestId } from './request-context.js';

export const logger = pino({
  level: config.logLevel,
  // Injects the current requestId (if any) into every log line without the
  // caller having to pass it explicitly.
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body', '*.password', '*.token'],
    remove: true,
  },
  transport: config.isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
