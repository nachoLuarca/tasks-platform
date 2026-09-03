import { Router } from 'express';

import { healthController } from './health.controller.js';

export const healthRouter = Router();

healthRouter.get('/live', healthController.liveness);
healthRouter.get('/ready', healthController.readiness);
