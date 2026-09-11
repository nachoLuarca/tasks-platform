import { actorColumns, canActorActOnResource, type Actor } from '../../shared/authorization/index.js';
import { prisma } from '../../shared/db/index.js';
import { ForbiddenError } from '../../shared/errors/index.js';
import { buildPage, decodeCursor, type Page } from '../../shared/pagination/index.js';
import { activityService } from '../activity/activity.service.js';
import { commentsRepository } from './comments.repository.js';
import type { CommentEntity } from './comments.types.js';

export const commentsService = {
  /** `actor` becomes the author: a user, or an API key in its own name -- never the person behind the key. */
  async create(taskId: string, organizationId: string, actor: Actor, body: string): Promise<CommentEntity> {
    const author = actorColumns(actor);
    return prisma.$transaction(async (tx) => {
      const comment = await commentsRepository.create(
        { taskId, authorId: author.userId, authorApiKeyId: author.apiKeyId, body },
        tx,
      );
      await activityService.record(
        { taskId, organizationId, actor, type: 'COMMENT_ADDED', before: null, after: { commentId: comment.id, body } },
        tx,
      );
      return comment;
    });
  },

  async list(taskId: string, cursor: string | undefined, limit: number): Promise<Page<CommentEntity>> {
    const cursorId = cursor ? decodeCursor(cursor) : undefined;
    const rows = await commentsRepository.listForTask(taskId, cursorId, limit);
    return buildPage(rows, limit);
  },

  /**
   * Author-only, full stop -- there is no `comment:update:any` in the matrix
   * (see permissions.ts), so this is a plain actor/author equality check,
   * never a role check. Even an OWNER with `comment:update:own` on the
   * matrix can only use it on *their own* comments, same as anyone else. A
   * comment an API key wrote has no user author, so no user can edit it.
   */
  async update(comment: CommentEntity, actorId: string, body: string): Promise<CommentEntity> {
    if (comment.authorId !== actorId) {
      throw new ForbiddenError('Only the author can edit their comment');
    }
    return commentsRepository.updateBody(comment.id, body);
  },

  async remove(comment: CommentEntity, actor: Actor): Promise<void> {
    const isOwnComment = actor.type === 'user' && comment.authorId === actor.userId;
    if (!canActorActOnResource(actor, 'comment:delete:any', 'comment:delete:own', isOwnComment)) {
      throw new ForbiddenError('Missing permission: comment:delete:own or comment:delete:any');
    }
    await commentsRepository.softDelete(comment.id);
  },
};
