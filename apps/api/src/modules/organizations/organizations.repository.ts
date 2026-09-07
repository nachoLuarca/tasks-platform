import { prisma, type DbClient } from '../../shared/db/index.js';
import type { CreateOrganizationInput, OrganizationEntity, UpdateOrganizationInput } from './organizations.types.js';

function toEntity(row: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}): OrganizationEntity {
  return row;
}

export const organizationsRepository = {
  async create(
    input: CreateOrganizationInput,
    client: DbClient = prisma,
  ): Promise<OrganizationEntity> {
    const row = await client.organization.create({ data: input });
    return toEntity(row);
  },

  async findBySlug(slug: string, client: DbClient = prisma): Promise<OrganizationEntity | null> {
    const row = await client.organization.findUnique({ where: { slug } });
    return row ? toEntity(row) : null;
  },

  async findById(id: string, client: DbClient = prisma): Promise<OrganizationEntity | null> {
    const row = await client.organization.findFirst({ where: { id, deletedAt: null } });
    return row ? toEntity(row) : null;
  },

  async update(
    id: string,
    input: UpdateOrganizationInput,
    client: DbClient = prisma,
  ): Promise<OrganizationEntity> {
    const row = await client.organization.update({ where: { id }, data: input });
    return toEntity(row);
  },

  async softDelete(id: string, client: DbClient = prisma): Promise<void> {
    await client.organization.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async listForUser(userId: string, client: DbClient = prisma): Promise<OrganizationEntity[]> {
    const memberships = await client.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships
      .filter((membership) => membership.organization.deletedAt === null)
      .map((membership) => toEntity(membership.organization));
  },
};
