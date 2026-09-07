import type { Role } from '@tasks-platform/contracts';

export interface MembershipEntity {
  id: string;
  userId: string;
  organizationId: string;
  role: Role;
  joinedAt: Date;
}

export interface MemberEntity extends MembershipEntity {
  email: string;
  name: string;
}
