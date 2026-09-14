import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { authRouter } from './modules/auth/auth.routes.js';
import { emailVerificationRouter } from './modules/email-verification/email-verification.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { invitationsRouter } from './modules/invitations/invitations.routes.js';
import { organizationsRouter } from './modules/organizations/organizations.routes.js';
import { passwordResetRouter } from './modules/password-reset/password-reset.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { buildOpenApiDocument } from './openapi-document.js';
import { config } from './shared/config/index.js';
import { errorHandler, notFoundHandler } from './shared/errors/index.js';
import { requestIdMiddleware, requestLoggerMiddleware } from './shared/http/index.js';
import { createDocsRouter } from './shared/openapi/index.js';

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
  app.use(cors({ origin: resolveCorsOrigin(), credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: config.bodyLimit }));

  app.use('/health', healthRouter);
  // GET /openapi.json and /docs: public, outside /v1, never behind requireAuth.
  app.use(createDocsRouter(buildOpenApiDocument()));
  app.use('/v1/auth', authRouter);
  app.use('/v1/auth', emailVerificationRouter);
  app.use('/v1/auth', passwordResetRouter);
  app.use('/v1/users', usersRouter);
  app.use('/v1/organizations', organizationsRouter);
  app.use('/v1/invitations', invitationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
