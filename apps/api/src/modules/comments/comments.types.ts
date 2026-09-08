export interface CommentAuthor {
  id: string;
  name: string;
  email: string;
}

export interface CommentEntity {
  id: string;
  taskId: string;
  authorId: string;
  author: CommentAuthor;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCommentInput {
  taskId: string;
  authorId: string;
  body: string;
}
