import type { Role } from '@tasks-platform/contracts';

import { prisma, type DbClient } from '../../shared/db/index.js';
import type { MemberEntity, MembershipEntity } from './members.types.js';

function toEntity(row: {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  joinedAt: Date;
}): MembershipEntity {
  return { ...row, role: row.role as Role };
}

function toMemberEntity(row: {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  joinedAt: Date;
  user: { email: string; name: string };
}): MemberEntity {
  return { ...toEntity(row), email: row.user.email, name: row.user.name };
}

export const membersRepository = {
  async create(
    input: { userId: string; organizationId: string; role: Role },
    client: DbClient = prisma,
  ): Promise<MembershipEntity> {
    const row = await client.membership.create({ data: input });
    return toEntity(row);
  },

  async findByUserAndOrganization(
    userId: string,
    organizationId: string,
    client: DbClient = prisma,
  ): Promise<MembershipEntity | null> {
    const row = await client.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return row ? toEntity(row) : null;
  },

  async listByOrganization(organizationId: string, client: DbClient = prisma): Promise<MemberEntity[]> {
    const rows = await client.membership.findMany({
      where: { organizationId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(toMemberEntity);
  },

  async countByRole(organizationId: string, role: Role, client: DbClient = prisma): Promise<number> {
    return client.membership.count({ where: { organizationId, role } });
  },

  async updateRole(id: string, role: Role, client: DbClient = prisma): Promise<MembershipEntity> {
    const row = await client.membership.update({ where: { id }, data: { role } });
    return toEntity(row);
  },

  async remove(id: string, client: DbClient = prisma): Promise<void> {
    await client.membership.delete({ where: { id } });
  },
};
