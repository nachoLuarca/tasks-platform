import { Router } from 'express';

import {
  createOrganizationRequestSchema,
  transferOwnershipRequestSchema,
  updateOrganizationRequestSchema,
} from '@tasks-platform/contracts';

import { requireMembership, requirePermission } from '../../shared/authorization/index.js';
import { validateBody } from '../../shared/http/index.js';
import { requireAuth } from '../auth/require-auth.middleware.js';
import { membersController } from '../members/members.controller.js';
import { membersRouter } from '../members/members.routes.js';
import { organizationInvitationsRouter } from '../invitations/invitations.routes.js';
import { projectsRouter } from '../projects/projects.routes.js';
import { organizationTasksRouter } from '../tasks/tasks.routes.js';
import { organizationsController } from './organizations.controller.js';

export const organizationsRouter = Router();

organizationsRouter.use(requireAuth);

organizationsRouter.post(
  '/',
  validateBody(createOrganizationRequestSchema),
  organizationsController.create,
);
organizationsRouter.get('/', organizationsController.list);

organizationsRouter.get('/:organizationId', requireMembership, organizationsController.getById);

organizationsRouter.patch(
  '/:organizationId',
  requireMembership,
  requirePermission('organization:update'),
  validateBody(updateOrganizationRequestSchema),
  organizationsController.update,
);

organizationsRouter.delete(
  '/:organizationId',
  requireMembership,
  requirePermission('organization:delete'),
  organizationsController.remove,
);

organizationsRouter.post(
  '/:organizationId/transfer-ownership',
  requireMembership,
  requirePermission('ownership:transfer'),
  validateBody(transferOwnershipRequestSchema),
  membersController.transferOwnership,
);

organizationsRouter.use('/:organizationId/members', requireMembership, membersRouter);
organizationsRouter.use('/:organizationId/invitations', requireMembership, organizationInvitationsRouter);
organizationsRouter.use('/:organizationId/projects', requireMembership, projectsRouter);
organizationsRouter.use('/:organizationId/tasks', requireMembership, organizationTasksRouter);
