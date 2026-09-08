import type { RequestHandler } from 'express';

import type { CommentListQuery, CreateCommentRequest, Role, UpdateCommentRequest } from '@tasks-platform/contracts';

import { UnauthorizedError } from '../../shared/errors/index.js';
import type { TaskEntity } from '../tasks/tasks.types.js';
import { toCommentResponse } from './comments.mapper.js';
import { commentsService } from './comments.service.js';
import type { CommentEntity } from './comments.types.js';

function getAuthenticatedUserId(req: { auth?: { userId: string } }): string {
  if (!req.auth) {
    throw new UnauthorizedError('Missing authentication context');
  }
  return req.auth.userId;
}

function getMembershipRole(req: { membership?: { role: Role } }): Role {
  if (!req.membership) {
    throw new UnauthorizedError('Missing membership context');
  }
  return req.membership.role;
}

function getTask(req: { task?: TaskEntity }): TaskEntity {
  if (!req.task) {
    throw new UnauthorizedError('Missing task context');
  }
  return req.task;
}

function getComment(req: { comment?: CommentEntity }): CommentEntity {
  if (!req.comment) {
    throw new UnauthorizedError('Missing comment context');
  }
  return req.comment;
}

export const commentsController = {
  create: (async (req, res) => {
    const task = getTask(req);
    const authorId = getAuthenticatedUserId(req);
    const body = req.body as CreateCommentRequest;

    const comment = await commentsService.create(task.id, authorId, body.body);
    res.status(201).json(toCommentResponse(comment));
  }) satisfies RequestHandler,

  list: (async (req, res) => {
    const task = getTask(req);
    const query = req.query as unknown as CommentListQuery;

    const page = await commentsService.list(task.id, query.cursor, query.limit);
    res.status(200).json({ data: page.data.map(toCommentResponse), nextCursor: page.nextCursor });
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const comment = getComment(req);
    const actorId = getAuthenticatedUserId(req);
    const body = req.body as UpdateCommentRequest;

    const updated = await commentsService.update(comment, actorId, body.body);
    res.status(200).json(toCommentResponse(updated));
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    const comment = getComment(req);
    const role = getMembershipRole(req);
    const actorId = getAuthenticatedUserId(req);

    await commentsService.remove(comment, role, actorId);
    res.status(204).send();
  }) satisfies RequestHandler,
};
