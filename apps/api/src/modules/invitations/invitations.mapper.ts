import type { CreateInvitationResponse, InvitationPreviewResponse, InvitationResponse } from '@tasks-platform/contracts';

import type { InvitationEntity, InvitationPreview } from './invitations.types.js';

export function toInvitationResponse(invitation: InvitationEntity): InvitationResponse {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

export function toCreateInvitationResponse(invitation: InvitationEntity): CreateInvitationResponse {
  return toInvitationResponse(invitation);
}

export function toInvitationPreviewResponse(preview: InvitationPreview): InvitationPreviewResponse {
  return preview;
}
