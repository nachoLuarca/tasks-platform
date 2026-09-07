import type { Role } from '@tasks-platform/contracts';

import { prisma } from '../../shared/db/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import {
  generateInvitationToken,
  hashToken,
  INVITATION_TOKEN_TTL_DAYS,
} from '../../shared/security/index.js';
import { membersRepository } from '../members/members.repository.js';
import { usersRepository } from '../users/users.repository.js';
import { invitationsRepository } from './invitations.repository.js';
import type { InvitationEntity, InvitationPreview } from './invitations.types.js';

function expiryDate(): Date {
  return new Date(Date.now() + INVITATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export const invitationsService = {
  async create(
    organizationId: string,
    invitedById: string,
    email: string,
    role: Role,
  ): Promise<{ invitation: InvitationEntity; token: string }> {
    const existingUser = await usersRepository.findByEmail(email);
    if (existingUser) {
      const existingMembership = await membersRepository.findByUserAndOrganization(
        existingUser.id,
        organizationId,
      );
      if (existingMembership) {
        throw new ConflictError('This person is already a member of the organization');
      }
    }

    const pending = await invitationsRepository.findPendingByOrganizationAndEmail(organizationId, email);
    if (pending) {
      throw new ConflictError('There is already a pending invitation for this email');
    }

    const { token, tokenHash } = generateInvitationToken();
    const invitation = await invitationsRepository.create({
      organizationId,
      email,
      role,
      tokenHash,
      invitedById,
      expiresAt: expiryDate(),
    });

    return { invitation, token };
  },

  async listPending(organizationId: string): Promise<InvitationEntity[]> {
    return invitationsRepository.listPendingByOrganization(organizationId);
  },

  async revoke(organizationId: string, invitationId: string): Promise<void> {
    const invitation = await invitationsRepository.findById(invitationId, organizationId);
    if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
      throw new NotFoundError('Invitation not found');
    }
    await invitationsRepository.revoke(invitation.id);
  },

  async preview(token: string): Promise<InvitationPreview> {
    const found = await invitationsRepository.findPreviewByTokenHash(hashToken(token));
    if (!found || found.entity.acceptedAt || found.entity.revokedAt || found.entity.expiresAt < new Date()) {
      throw new NotFoundError('Invitation not found');
    }
    return { organizationName: found.organizationName, invitedByName: found.invitedByName, role: found.role };
  },

  async accept(token: string, userId: string, userEmail: string): Promise<void> {
    const invitation = await invitationsRepository.findByTokenHash(hashToken(token));
    if (!invitation) {
      throw new NotFoundError('Invitation not found');
    }
    if (invitation.revokedAt) {
      throw new ConflictError('Invitation has been revoked');
    }
    if (invitation.acceptedAt) {
      throw new ConflictError('Invitation has already been accepted');
    }
    if (invitation.expiresAt < new Date()) {
      throw new ConflictError('Invitation has expired');
    }
    if (invitation.email !== userEmail) {
      throw new ForbiddenError('This invitation was sent to a different email address');
    }

    const existingMembership = await membersRepository.findByUserAndOrganization(
      userId,
      invitation.organizationId,
    );
    if (existingMembership) {
      throw new ConflictError('You are already a member of this organization');
    }

    await prisma.$transaction(async (tx) => {
      await membersRepository.create(
        { userId, organizationId: invitation.organizationId, role: invitation.role },
        tx,
      );
      await invitationsRepository.markAccepted(invitation.id, tx);
    });
  },
};
