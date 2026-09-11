export interface CommentAuthor {
  id: string;
  name: string;
  email: string;
}

export interface CommentApiKeyAuthor {
  id: string;
  name: string;
  prefix: string;
}

/** Exactly one author: a user (`authorId` + `author`) or an API key (`authorApiKeyId` + `authorApiKey`). */
export interface CommentEntity {
  id: string;
  taskId: string;
  authorId: string | null;
  author: CommentAuthor | null;
  authorApiKeyId: string | null;
  authorApiKey: CommentApiKeyAuthor | null;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCommentInput {
  taskId: string;
  authorId: string | null;
  authorApiKeyId: string | null;
  body: string;
}
