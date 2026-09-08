import { prisma } from '../../src/shared/db/index.js';

/** Order matters: children before parents, to respect foreign keys. */
export async function resetDatabase(): Promise<void> {
  await prisma.refreshToken.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}
