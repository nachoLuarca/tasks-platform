import { prisma, type DbClient } from '../../shared/db/index.js';
import type { CommentEntity, CreateCommentInput } from './comments.types.js';

const AUTHOR_SELECT = { select: { id: true, name: true, email: true } };

type CommentRow = {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; email: string };
};

function toEntity(row: CommentRow): CommentEntity {
  return { ...row };
}

export const commentsRepository = {
  async create(input: CreateCommentInput, client: DbClient): Promise<CommentEntity> {
    const row = await client.comment.create({
      data: { taskId: input.taskId, authorId: input.authorId, body: input.body },
      include: { author: AUTHOR_SELECT },
    });
    return toEntity(row);
  },

  async findById(id: string, taskId: string, client: DbClient = prisma): Promise<CommentEntity | null> {
    const row = await client.comment.findFirst({
      where: { id, taskId, deletedAt: null },
      include: { author: AUTHOR_SELECT },
    });
    return row ? toEntity(row) : null;
  },

  /** Chronological (oldest first), same reading order a conversation thread would use. */
  async listForTask(
    taskId: string,
    cursorId: string | undefined,
    limit: number,
    client: DbClient = prisma,
  ): Promise<CommentEntity[]> {
    const rows = await client.comment.findMany({
      where: { taskId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      take: limit + 1,
      include: { author: AUTHOR_SELECT },
    });
    return rows.map(toEntity);
  },

  async updateBody(id: string, body: string, client: DbClient = prisma): Promise<CommentEntity> {
    const row = await client.comment.update({
      where: { id },
      data: { body, editedAt: new Date() },
      include: { author: AUTHOR_SELECT },
    });
    return toEntity(row);
  },

  async softDelete(id: string, client: DbClient = prisma): Promise<void> {
    await client.comment.update({ where: { id }, data: { deletedAt: new Date() } });
  },
};
