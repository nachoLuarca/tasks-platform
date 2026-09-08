import { prisma, type DbClient } from '../../shared/db/index.js';
import type { CreateLabelInput, LabelEntity, UpdateLabelInput } from './labels.types.js';

function toEntity(row: {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}): LabelEntity {
  return { ...row };
}

export const labelsRepository = {
  async create(input: CreateLabelInput, client: DbClient = prisma): Promise<LabelEntity> {
    const row = await client.label.create({ data: input });
    return toEntity(row);
  },

  /** Case-insensitive lookup, backing the functional unique index (see the migration). */
  async findByNameCaseInsensitive(organizationId: string, name: string, client: DbClient = prisma): Promise<LabelEntity | null> {
    const row = await client.label.findFirst({ where: { organizationId, name: { equals: name, mode: 'insensitive' } } });
    return row ? toEntity(row) : null;
  },

  async findById(id: string, organizationId: string, client: DbClient = prisma): Promise<LabelEntity | null> {
    const row = await client.label.findFirst({ where: { id, organizationId } });
    return row ? toEntity(row) : null;
  },

  async findManyByIds(organizationId: string, ids: string[], client: DbClient = prisma): Promise<LabelEntity[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await client.label.findMany({ where: { organizationId, id: { in: ids } } });
    return rows.map(toEntity);
  },

  async list(
    organizationId: string,
    cursorId: string | undefined,
    limit: number,
    client: DbClient = prisma,
  ): Promise<LabelEntity[]> {
    const rows = await client.label.findMany({
      where: { organizationId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      take: limit + 1,
    });
    return rows.map(toEntity);
  },

  async update(id: string, input: UpdateLabelInput, client: DbClient = prisma): Promise<LabelEntity> {
    const row = await client.label.update({ where: { id }, data: input });
    return toEntity(row);
  },

  /** Hard delete: no `deletedAt` on Label (see the schema comment). The onDelete: Cascade on TaskLabel.label drops its join rows without touching the tasks it was attached to. */
  async remove(id: string, client: DbClient = prisma): Promise<void> {
    await client.label.delete({ where: { id } });
  },

  async listForTask(taskId: string, client: DbClient = prisma): Promise<LabelEntity[]> {
    const rows = await client.label.findMany({
      where: { taskLabels: { some: { taskId } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toEntity);
  },

  async replaceTaskLabels(taskId: string, labelIds: string[], client: DbClient): Promise<void> {
    await client.taskLabel.deleteMany({ where: { taskId } });
    if (labelIds.length > 0) {
      await client.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId, labelId })) });
    }
  },
};
