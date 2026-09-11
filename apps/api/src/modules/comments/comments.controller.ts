import type { RequestHandler } from 'express';

import type { CommentListQuery, CreateCommentRequest, UpdateCommentRequest } from '@tasks-platform/contracts';

import { requireActor, requireUserId } from '../../shared/authorization/index.js';
import { UnauthorizedError } from '../../shared/errors/index.js';
import type { TaskEntity } from '../tasks/tasks.types.js';
import { toCommentResponse } from './comments.mapper.js';
import { commentsService } from './comments.service.js';
import type { CommentEntity } from './comments.types.js';

function getOrganizationId(req: { membership?: { organizationId: string } }): string {
  if (!req.membership) {
    throw new UnauthorizedError('Missing membership context');
  }
  return req.membership.organizationId;
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
    const organizationId = getOrganizationId(req);
    const actor = requireActor(req);
    const body = req.body as CreateCommentRequest;

    const comment = await commentsService.create(task.id, organizationId, actor, body.body);
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
    const actorId = requireUserId(req);
    const body = req.body as UpdateCommentRequest;

    const updated = await commentsService.update(comment, actorId, body.body);
    res.status(200).json(toCommentResponse(updated));
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    const comment = getComment(req);
    const actor = requireActor(req);

    await commentsService.remove(comment, actor);
    res.status(204).send();
  }) satisfies RequestHandler,
};
