import { prisma, type DbClient } from '../../shared/db/index.js';
import type { CreateOrganizationInput, OrganizationEntity } from './organizations.types.js';

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

  async addMember(
    userId: string,
    organizationId: string,
    client: DbClient = prisma,
  ): Promise<void> {
    await client.membership.create({ data: { userId, organizationId } });
  },

  async isMember(
    userId: string,
    organizationId: string,
    client: DbClient = prisma,
  ): Promise<boolean> {
    const membership = await client.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return membership !== null;
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
