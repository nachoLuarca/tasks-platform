import { Router } from 'express';

import { commentListQuerySchema, createCommentRequestSchema, updateCommentRequestSchema } from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateBody, validateQuery } from '../../shared/http/index.js';
import { commentsController } from './comments.controller.js';
import { requireComment } from './require-comment.middleware.js';

/**
 * Mounted at .../tasks/:taskId/comments, behind requireMembership +
 * requireProject + requireTask (applied once by tasks.routes.ts at the
 * mount point). Reading comments reuses `task:read` (see the note on
 * `PERMISSIONS` in shared/authorization/permissions.ts); writing them needs
 * `comment:create` / `comment:update:own` / `comment:delete:own`|`:any`.
 */
export const taskCommentsRouter = Router({ mergeParams: true });

taskCommentsRouter.post('/', requirePermission('comment:create'), validateBody(createCommentRequestSchema), commentsController.create);
taskCommentsRouter.get('/', requirePermission('task:read'), validateQuery(commentListQuerySchema), commentsController.list);

// No flat requirePermission for PATCH: comment:update:own only gates who may
// try to edit *a* comment at all (VIEWER can't); whether *this* comment is
// theirs is an author-equality check commentsService makes on its own,
// deliberately not routed through canActOnResource -- see comments.service.ts.
taskCommentsRouter.patch(
  '/:commentId',
  requirePermission('comment:update:own'),
  requireComment,
  validateBody(updateCommentRequestSchema),
  commentsController.update,
);

// No flat requirePermission for DELETE either: own vs any depends on this
// specific comment, resolved once req.comment and req.membership.role are
// both available. See comments.service.ts.
taskCommentsRouter.delete('/:commentId', requireComment, commentsController.remove);
