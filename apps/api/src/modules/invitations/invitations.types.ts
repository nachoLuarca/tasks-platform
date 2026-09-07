import type { Role } from '@tasks-platform/contracts';

export interface InvitationEntity {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface InvitationPreview {
  organizationName: string;
  invitedByName: string;
  role: Role;
}

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role: Role;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
}
