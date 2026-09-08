import type { RequestHandler } from 'express';

import { NotFoundError, UnauthorizedError } from '../../shared/errors/index.js';
import { tasksRepository } from './tasks.repository.js';

/** Resolves `:taskId`, scoped to the project already resolved by `requireProject`, onto `req.task`. */
export const requireTask: RequestHandler = async (req, _res, next) => {
  if (!req.project) {
    next(new UnauthorizedError('Missing project context'));
    return;
  }

  const taskId = req.params.taskId as string;
  const task = await tasksRepository.findById(taskId, req.project.id);
  if (!task) {
    next(new NotFoundError('Task not found'));
    return;
  }

  req.task = task;
  next();
};
