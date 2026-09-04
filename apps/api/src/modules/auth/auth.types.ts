export interface RefreshTokenEntity {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}
