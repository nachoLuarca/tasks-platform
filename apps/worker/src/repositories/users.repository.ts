import { prisma } from '@tasks-platform/shared';

export interface AccountRecipient {
  id: string;
  email: string;
  name: string;
}

/** The worker's only read of User: just enough to address an account email. */
export const usersRepository = {
  /** Soft-deleted accounts are treated as nonexistent: they never receive a reset link. */
  async findActiveByEmail(email: string): Promise<AccountRecipient | null> {
    return prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, name: true },
    });
  },
};
