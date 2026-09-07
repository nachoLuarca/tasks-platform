import type { Role } from '@tasks-platform/contracts';

import { prisma, type DbClient } from '../../shared/db/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { membersRepository } from './members.repository.js';
import type { MemberEntity, MembershipEntity } from './members.types.js';

async function requireMembershipByUser(
  userId: string,
  organizationId: string,
  client?: DbClient,
): Promise<MembershipEntity> {
  const membership = await membersRepository.findByUserAndOrganization(userId, organizationId, client);
  if (!membership) {
    throw new NotFoundError('Member not found');
  }
  return membership;
}

export const membersService = {
  /** Used by organizationsService when a new organization is created. */
  async addOwner(userId: string, organizationId: string, client?: DbClient): Promise<MembershipEntity> {
    return membersRepository.create({ userId, organizationId, role: 'OWNER' }, client);
  },

  async list(organizationId: string): Promise<MemberEntity[]> {
    return membersRepository.listByOrganization(organizationId);
  },

  /**
   * Changes a member's role. The OWNER role can only ever change hands
   * through `transferOwnership`, since it is the invariant that keeps
   * exactly one OWNER per organization -- a plain role update could
   * otherwise create a second one, or strand the organization without one.
   */
  async updateRole(organizationId: string, targetUserId: string, newRole: Role): Promise<MembershipEntity> {
    const target = await requireMembershipByUser(targetUserId, organizationId);

    if (target.role === 'OWNER') {
      throw new ConflictError('Transfer ownership instead of changing the owner role directly');
    }
    if (newRole === 'OWNER') {
      throw new ConflictError('Use the transfer-ownership endpoint to change the organization owner');
    }

    return membersRepository.updateRole(target.id, newRole);
  },

  async remove(organizationId: string, targetUserId: string): Promise<void> {
    const target = await requireMembershipByUser(targetUserId, organizationId);

    if (target.role === 'OWNER') {
      throw new ConflictError('The owner cannot be removed; transfer ownership first');
    }

    await membersRepository.remove(target.id);
  },

  async leave(organizationId: string, userId: string): Promise<void> {
    const membership = await requireMembershipByUser(userId, organizationId);

    if (membership.role === 'OWNER') {
      throw new ConflictError('Transfer ownership before leaving the organization');
    }

    await membersRepository.remove(membership.id);
  },

  /** Demotes the current owner to ADMIN and promotes `newOwnerUserId`, atomically. */
  async transferOwnership(
    organizationId: string,
    currentOwnerMembershipId: string,
    newOwnerUserId: string,
  ): Promise<void> {
    const target = await requireMembershipByUser(newOwnerUserId, organizationId);

    if (target.role === 'OWNER') {
      throw new ConflictError('User is already the owner');
    }

    await prisma.$transaction(async (tx) => {
      await membersRepository.updateRole(currentOwnerMembershipId, 'ADMIN', tx);
      await membersRepository.updateRole(target.id, 'OWNER', tx);
    });
  },
};
