import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { healthRouter } from './modules/health/health.routes.js';
import { config } from './shared/config/index.js';
import { errorHandler, notFoundHandler } from './shared/errors/index.js';
import { requestIdMiddleware, requestLoggerMiddleware } from './shared/http/index.js';

function resolveCorsOrigin(): boolean | string[] {
  if (config.cors.origin === '*') {
    return true;
  }
  return config.cors.origin.split(',').map((origin) => origin.trim());
}

export function buildApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(helmet());
  app.use(cors({ origin: resolveCorsOrigin() }));
  app.use(compression());
  app.use(express.json({ limit: config.bodyLimit }));

  app.use('/health', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
