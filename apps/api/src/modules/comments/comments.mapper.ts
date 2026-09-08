import type { CommentResponse } from '@tasks-platform/contracts';

import type { CommentEntity } from './comments.types.js';

export function toCommentResponse(comment: CommentEntity): CommentResponse {
  return {
    id: comment.id,
    taskId: comment.taskId,
    authorId: comment.authorId,
    author: comment.author,
    body: comment.body,
    editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}
