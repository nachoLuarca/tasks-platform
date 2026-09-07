import type { Role } from '@tasks-platform/contracts';

import { prisma, type DbClient } from '../../shared/db/index.js';
import type { CreateInvitationInput, InvitationEntity, InvitationPreview } from './invitations.types.js';

function toEntity(row: {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): InvitationEntity {
  return { ...row, role: row.role as Role };
}

/** `acceptedAt IS NULL AND revokedAt IS NULL`: the same predicate as the partial unique index. */
const PENDING_WHERE = { acceptedAt: null, revokedAt: null };

export const invitationsRepository = {
  async create(input: CreateInvitationInput, client: DbClient = prisma): Promise<InvitationEntity> {
    const row = await client.invitation.create({ data: input });
    return toEntity(row);
  },

  async findPendingByOrganizationAndEmail(
    organizationId: string,
    email: string,
    client: DbClient = prisma,
  ): Promise<InvitationEntity | null> {
    const row = await client.invitation.findFirst({
      where: { organizationId, email, ...PENDING_WHERE },
    });
    return row ? toEntity(row) : null;
  },

  async listPendingByOrganization(organizationId: string, client: DbClient = prisma): Promise<InvitationEntity[]> {
    const rows = await client.invitation.findMany({
      where: { organizationId, ...PENDING_WHERE },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toEntity);
  },

  async findById(id: string, organizationId: string, client: DbClient = prisma): Promise<InvitationEntity | null> {
    const row = await client.invitation.findFirst({ where: { id, organizationId } });
    return row ? toEntity(row) : null;
  },

  async findByTokenHash(tokenHash: string, client: DbClient = prisma): Promise<InvitationEntity | null> {
    const row = await client.invitation.findUnique({ where: { tokenHash } });
    return row ? toEntity(row) : null;
  },

  async findPreviewByTokenHash(
    tokenHash: string,
    client: DbClient = prisma,
  ): Promise<(InvitationPreview & { entity: InvitationEntity }) | null> {
    const row = await client.invitation.findUnique({
      where: { tokenHash },
      include: {
        organization: { select: { name: true } },
        invitedBy: { select: { name: true } },
      },
    });
    if (!row) {
      return null;
    }
    const { organization, invitedBy, ...invitation } = row;
    return {
      organizationName: organization.name,
      invitedByName: invitedBy.name,
      role: invitation.role,
      entity: toEntity(invitation),
    };
  },

  async revoke(id: string, client: DbClient = prisma): Promise<void> {
    await client.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  async markAccepted(id: string, client: DbClient = prisma): Promise<void> {
    await client.invitation.update({ where: { id }, data: { acceptedAt: new Date() } });
  },
};
