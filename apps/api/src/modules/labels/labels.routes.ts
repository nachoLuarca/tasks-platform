import { Router } from 'express';

import { createLabelRequestSchema, labelListQuerySchema, updateLabelRequestSchema } from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateBody, validateQuery } from '../../shared/http/index.js';
import { labelsController } from './labels.controller.js';
import { requireLabel } from './require-label.middleware.js';

/**
 * Mounted at /v1/organizations/:organizationId/labels, behind
 * requireMembership. Creating, renaming and deleting a label is
 * `label:manage` (ADMIN/OWNER only); reading the catalog reuses `task:read`,
 * same reasoning as comments and activity (see the note on `PERMISSIONS` in
 * shared/authorization/permissions.ts).
 */
export const labelsRouter = Router({ mergeParams: true });

labelsRouter.post('/', requirePermission('label:manage'), validateBody(createLabelRequestSchema), labelsController.create);
labelsRouter.get('/', requirePermission('task:read'), validateQuery(labelListQuerySchema), labelsController.list);

labelsRouter.patch(
  '/:labelId',
  requirePermission('label:manage'),
  requireLabel,
  validateBody(updateLabelRequestSchema),
  labelsController.update,
);
labelsRouter.delete('/:labelId', requirePermission('label:manage'), requireLabel, labelsController.remove);
