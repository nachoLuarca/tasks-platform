import { randomUUID } from 'node:crypto';

import { prisma } from '@tasks-platform/shared';

/** A throwaway organization + user, just enough to satisfy WebhookEndpoint's/OutboxEvent's foreign keys. Never cleaned up (see helpers/db.ts) -- a handful of leftover rows in a test database is harmless. */
export async function createTestOrganization(): Promise<{ organizationId: string; userId: string }> {
  const user = await prisma.user.create({
    data: { email: `worker-test-${randomUUID()}@example.com`, passwordHash: 'not-a-real-hash', name: 'Worker Test User' },
  });
  const organization = await prisma.organization.create({
    data: { name: 'Worker Test Org', slug: `worker-test-${randomUUID()}` },
  });
  return { organizationId: organization.id, userId: user.id };
}
