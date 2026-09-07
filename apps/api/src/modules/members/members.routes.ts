import { Router } from 'express';

import { updateMemberRoleRequestSchema } from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateBody } from '../../shared/http/index.js';
import { membersController } from './members.controller.js';

export const membersRouter = Router({ mergeParams: true });

membersRouter.get('/', requirePermission('member:list'), membersController.list);

// Must come before "/:userId" so "me" isn't swallowed by the param route.
membersRouter.delete('/me', requirePermission('member:leave'), membersController.leave);

membersRouter.patch(
  '/:userId',
  requirePermission('member:update-role'),
  validateBody(updateMemberRoleRequestSchema),
  membersController.updateRole,
);
membersRouter.delete('/:userId', requirePermission('member:remove'), membersController.remove);
