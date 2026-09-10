import { emailQueue, webhookDeliveryQueue } from '@tasks-platform/shared';

import { prisma } from '../../src/shared/db/index.js';

/** Order matters: children before parents, to respect foreign keys. Also clears the BullMQ queues -- see resetQueues(). */
export async function resetDatabase(): Promise<void> {
  await resetQueues();
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.invitation.deleteMany();
  // TaskActivity before ApiKey: deleting an ApiKey that still has activity
  // rows pointing at it (apiKeyActorId) would SET NULL that column via the
  // FK, and since those rows never have `actorId` set either (an activity
  // row's actor is exactly one of the two, see the TaskActivity model
  // comment in schema.prisma), that SET NULL would violate the
  // TaskActivity_actor_xor_check constraint.
  await prisma.taskActivity.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.taskLabel.deleteMany();
  await prisma.task.deleteMany();
  await prisma.label.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * No worker consumes these queues during the test suite, so jobs pile up in
 * Redis across every test unless cleared -- called alongside
 * `resetDatabase()` so a test never sees a job queued by an earlier,
 * unrelated test (see test/helpers/invitations.ts, which reads the most
 * recent matching job, and would otherwise still work by accident, but
 * this keeps the queues from growing unbounded over a whole suite run).
 */
export async function resetQueues(): Promise<void> {
  await Promise.all([
    emailQueue().obliterate({ force: true }),
    webhookDeliveryQueue().obliterate({ force: true }),
  ]);
}
