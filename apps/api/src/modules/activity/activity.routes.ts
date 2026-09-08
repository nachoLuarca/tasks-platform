import { Router } from 'express';

import { taskActivityListQuerySchema } from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateQuery } from '../../shared/http/index.js';
import { activityController } from './activity.controller.js';

/**
 * Mounted at .../tasks/:taskId/activity, behind requireMembership +
 * requireProject + requireTask (applied once by tasks.routes.ts at the
 * mount point, not repeated here). Gated by `task:read`: seeing a task's
 * history is part of reading that task, not a separate permission (see the
 * note on `PERMISSIONS` in shared/authorization/permissions.ts). Read-only
 * on purpose -- no POST/PATCH/DELETE route exists here.
 */
export const taskActivityRouter = Router({ mergeParams: true });

taskActivityRouter.get('/', requirePermission('task:read'), validateQuery(taskActivityListQuerySchema), activityController.list);
