import type { RequestHandler } from 'express';

import { healthService } from './health.service.js';

export const healthController = {
  liveness: ((_req, res) => {
    res.status(200).json(healthService.checkLiveness());
  }) satisfies RequestHandler,

  readiness: (async (_req, res) => {
    const result = await healthService.checkReadiness();
    res.status(result.status === 'ok' ? 200 : 503).json(result);
  }) satisfies RequestHandler,
};
