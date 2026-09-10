import { createServer, type Server } from 'node:http';

import { prisma, redis } from '@tasks-platform/shared';

import { config } from './config/index.js';
import { logger } from './logger.js';

/**
 * A minimal HTTP server, deliberately without Express: this process exposes
 * exactly one thing over HTTP (its own health), everything else it does is
 * queue consumption -- PHASE.md is explicit that the worker "no expone HTTP
 * salvo un endpoint de salud". `/health/live` matches the api's own
 * liveness path so `docker-compose.yml`'s healthcheck for this service can
 * follow the exact same pattern.
 */
export function startHealthServer(): Server {
  const server = createServer((req, res) => {
    if (req.url === '/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.url === '/health/ready') {
      Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()])
        .then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok' }));
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Readiness check failed');
          res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'unavailable' }));
        });
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(config.port, () => {
    logger.info({ port: config.port }, 'Worker health server listening');
  });

  return server;
}
