import { Router } from 'express';

import { createInvitationRequestSchema } from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateBody } from '../../shared/http/index.js';
import { requireAuth } from '../auth/require-auth.middleware.js';
import { invitationsController } from './invitations.controller.js';

/** Mounted at /v1/organizations/:organizationId/invitations, behind requireAuth + requireMembership. */
export const organizationInvitationsRouter = Router({ mergeParams: true });

organizationInvitationsRouter.post(
  '/',
  requirePermission('invitation:create'),
  validateBody(createInvitationRequestSchema),
  invitationsController.create,
);
organizationInvitationsRouter.get('/', requirePermission('invitation:list'), invitationsController.listPending);
organizationInvitationsRouter.delete(
  '/:id',
  requirePermission('invitation:revoke'),
  invitationsController.revoke,
);

/** Mounted at /v1/invitations: the preview is public, accepting requires auth. */
export const invitationsRouter = Router();

invitationsRouter.get('/:token', invitationsController.preview);
invitationsRouter.post('/:token/accept', requireAuth, invitationsController.accept);
