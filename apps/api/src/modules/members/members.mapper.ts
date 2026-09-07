import type { MemberResponse } from '@tasks-platform/contracts';

import type { MemberEntity } from './members.types.js';

export function toMemberResponse(member: MemberEntity): MemberResponse {
  return {
    userId: member.userId,
    email: member.email,
    name: member.name,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  };
}
