import { Router } from 'express';

import { createProjectRequestSchema, projectListQuerySchema, updateProjectRequestSchema } from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateBody, validateQuery } from '../../shared/http/index.js';
import { projectTasksRouter } from '../tasks/tasks.routes.js';
import { projectsController } from './projects.controller.js';
import { requireProject } from './require-project.middleware.js';

/** Mounted at /v1/organizations/:organizationId/projects, behind requireAuth + requireMembership. */
export const projectsRouter = Router({ mergeParams: true });

projectsRouter.post('/', requirePermission('project:create'), validateBody(createProjectRequestSchema), projectsController.create);
projectsRouter.get('/', requirePermission('project:read'), validateQuery(projectListQuerySchema), projectsController.list);

projectsRouter.get('/:projectId', requirePermission('project:read'), requireProject, projectsController.getById);
projectsRouter.patch(
  '/:projectId',
  requirePermission('project:update'),
  requireProject,
  validateBody(updateProjectRequestSchema),
  projectsController.update,
);
projectsRouter.delete('/:projectId', requirePermission('project:delete'), requireProject, projectsController.remove);
projectsRouter.post('/:projectId/archive', requirePermission('project:update'), requireProject, projectsController.archive);
projectsRouter.post('/:projectId/unarchive', requirePermission('project:update'), requireProject, projectsController.unarchive);

projectsRouter.use('/:projectId/tasks', requireProject, projectTasksRouter);
