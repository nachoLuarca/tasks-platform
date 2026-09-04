import type { UserProfile } from '@tasks-platform/contracts';

import type { UserEntity } from './users.types.js';

export function toUserProfile(user: UserEntity): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}
