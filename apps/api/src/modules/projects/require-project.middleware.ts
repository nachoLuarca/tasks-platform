import type { RequestHandler } from 'express';

import { NotFoundError, UnauthorizedError } from '../../shared/errors/index.js';
import { projectsRepository } from './projects.repository.js';

/**
 * Resolves `:projectId` in the path, scoped to the organization already
 * resolved by `requireMembership`, and leaves it on `req.project`. Same
 * "404, never 403" rule as `requireMembership`: a project that doesn't
 * exist, belongs to a different organization, or is soft-deleted all look
 * identical to the caller.
 */
export const requireProject: RequestHandler = async (req, _res, next) => {
  if (!req.membership) {
    next(new UnauthorizedError('Missing membership context'));
    return;
  }

  const projectId = req.params.projectId as string;
  const project = await projectsRepository.findById(projectId, req.membership.organizationId);
  if (!project) {
    next(new NotFoundError('Project not found'));
    return;
  }

  req.project = project;
  next();
};
