import { prisma } from '@tasks-platform/shared';

/**
 * Only the tables this suite's own tests write to. Deliberately doesn't
 * touch User/Organization/Membership -- those tables are shared with
 * apps/api's own test run against the same database, and this suite
 * creates its own throwaway organization/user per test instead of relying
 * on (or cleaning up) whatever either suite leaves behind, so the two
 * suites' runs can never conflict over ordering.
 */
export async function resetWebhookState(): Promise<void> {
  await prisma.webhookDelivery.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
}
