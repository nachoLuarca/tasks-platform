import type { RequestHandler } from 'express';

import { NotFoundError, UnauthorizedError } from '../../shared/errors/index.js';
import { commentsRepository } from './comments.repository.js';

/** Resolves `:commentId`, scoped to the task already resolved by `requireTask`, onto `req.comment`. */
export const requireComment: RequestHandler = async (req, _res, next) => {
  if (!req.task) {
    next(new UnauthorizedError('Missing task context'));
    return;
  }

  const commentId = req.params.commentId as string;
  const comment = await commentsRepository.findById(commentId, req.task.id);
  if (!comment) {
    next(new NotFoundError('Comment not found'));
    return;
  }

  req.comment = comment;
  next();
};
