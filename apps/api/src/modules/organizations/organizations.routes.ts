import { Router } from 'express';

import { createOrganizationRequestSchema } from '@tasks-platform/contracts';

import { validateBody } from '../../shared/http/index.js';
import { requireAuth } from '../auth/require-auth.middleware.js';
import { organizationsController } from './organizations.controller.js';

export const organizationsRouter = Router();

organizationsRouter.use(requireAuth);

organizationsRouter.post(
  '/',
  validateBody(createOrganizationRequestSchema),
  organizationsController.create,
);
organizationsRouter.get('/', organizationsController.list);
organizationsRouter.get('/:id', organizationsController.getById);
