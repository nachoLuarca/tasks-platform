import { Router } from 'express';

import {
  assignTaskRequestSchema,
  createTaskRequestSchema,
  taskListQuerySchema,
  updateTaskRequestSchema,
} from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateBody, validateQuery } from '../../shared/http/index.js';
import { requireTask } from './require-task.middleware.js';
import { tasksController } from './tasks.controller.js';

/** Mounted at /v1/organizations/:organizationId/projects/:projectId/tasks, behind requireMembership + requireProject. */
export const projectTasksRouter = Router({ mergeParams: true });

projectTasksRouter.post('/', requirePermission('task:create'), validateBody(createTaskRequestSchema), tasksController.create);
projectTasksRouter.get('/', requirePermission('task:read'), validateQuery(taskListQuerySchema), tasksController.list);

projectTasksRouter.get('/:taskId', requirePermission('task:read'), requireTask, tasksController.getById);

// No flat requirePermission here: "own vs any" depends on this specific
// task, so tasksService resolves it against the matrix once req.task and
// req.membership.role are both available. See tasks.service.ts.
projectTasksRouter.patch('/:taskId', requireTask, validateBody(updateTaskRequestSchema), tasksController.update);
projectTasksRouter.delete('/:taskId', requireTask, tasksController.remove);

projectTasksRouter.post(
  '/:taskId/assign',
  requirePermission('task:assign'),
  requireTask,
  validateBody(assignTaskRequestSchema),
  tasksController.assign,
);
projectTasksRouter.post('/:taskId/unassign', requirePermission('task:assign'), requireTask, tasksController.unassign);

/** Mounted at /v1/organizations/:organizationId/tasks, behind requireMembership. */
export const organizationTasksRouter = Router({ mergeParams: true });

organizationTasksRouter.get(
  '/',
  requirePermission('task:read'),
  validateQuery(taskListQuerySchema),
  tasksController.listAssignedToMe,
);
