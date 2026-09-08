import { Router } from 'express';

import {
  assignTaskRequestSchema,
  createTaskRequestSchema,
  setTaskLabelsRequestSchema,
  taskListQuerySchema,
  updateTaskRequestSchema,
} from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateBody, validateQuery } from '../../shared/http/index.js';
import { taskActivityRouter } from '../activity/activity.routes.js';
import { taskCommentsRouter } from '../comments/comments.routes.js';
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

// No flat requirePermission here either: `task:assign` lets an ADMIN/OWNER
// assign anyone to anyone, but a MEMBER with only `task:assign:self` may
// claim or drop *their own* assignment. tasksService resolves which applies
// once req.membership.role and req.task are available. See tasks.service.ts.
projectTasksRouter.post('/:taskId/assign', requireTask, validateBody(assignTaskRequestSchema), tasksController.assign);
projectTasksRouter.post('/:taskId/unassign', requireTask, tasksController.unassign);

// Governed by task:update:own/:any (PHASE.md decision 4), not label:manage:
// setting a task's labels is modifying the task, same as its title.
projectTasksRouter.put(
  '/:taskId/labels',
  requireTask,
  validateBody(setTaskLabelsRequestSchema),
  tasksController.setLabels,
);

projectTasksRouter.use('/:taskId/comments', requireTask, taskCommentsRouter);
projectTasksRouter.use('/:taskId/activity', requireTask, taskActivityRouter);

/** Mounted at /v1/organizations/:organizationId/tasks, behind requireMembership. */
export const organizationTasksRouter = Router({ mergeParams: true });

organizationTasksRouter.get(
  '/',
  requirePermission('task:read'),
  validateQuery(taskListQuerySchema),
  tasksController.listAssignedToMe,
);
