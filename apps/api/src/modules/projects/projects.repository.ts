import type { ProjectStatus } from '@tasks-platform/contracts';

import { prisma, type DbClient } from '../../shared/db/index.js';
import type {
  CreateProjectInput,
  ListProjectsFilter,
  ProjectEntity,
  UpdateProjectInput,
} from './projects.types.js';

function toEntity(row: {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  taskCounter: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): ProjectEntity {
  return { ...row, status: row.status as ProjectStatus };
}

export const projectsRepository = {
  async create(input: CreateProjectInput, client: DbClient = prisma): Promise<ProjectEntity> {
    const row = await client.project.create({ data: input });
    return toEntity(row);
  },

  async findByKey(organizationId: string, key: string, client: DbClient = prisma): Promise<ProjectEntity | null> {
    const row = await client.project.findFirst({ where: { organizationId, key, deletedAt: null } });
    return row ? toEntity(row) : null;
  },

  async findById(id: string, organizationId: string, client: DbClient = prisma): Promise<ProjectEntity | null> {
    const row = await client.project.findFirst({ where: { id, organizationId, deletedAt: null } });
    return row ? toEntity(row) : null;
  },

  async list(
    organizationId: string,
    filter: ListProjectsFilter,
    cursorId: string | undefined,
    limit: number,
    client: DbClient = prisma,
  ): Promise<ProjectEntity[]> {
    const rows = await client.project.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      take: limit + 1,
    });
    return rows.map(toEntity);
  },

  async update(id: string, input: UpdateProjectInput, client: DbClient = prisma): Promise<ProjectEntity> {
    const row = await client.project.update({ where: { id }, data: input });
    return toEntity(row);
  },

  async updateStatus(id: string, status: ProjectStatus, client: DbClient = prisma): Promise<ProjectEntity> {
    const row = await client.project.update({ where: { id }, data: { status } });
    return toEntity(row);
  },

  async softDelete(id: string, client: DbClient = prisma): Promise<void> {
    await client.project.update({ where: { id }, data: { deletedAt: new Date() } });
  },
};
