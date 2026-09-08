import { prisma, WEBHOOK_DELIVERY_JOB_OPTIONS, webhookDeliveryQueue } from '@tasks-platform/shared';

import { logger } from '../logger.js';

interface ClaimedEvent {
  id: string;
  organizationId: string;
  type: string;
}

const DEFAULT_BATCH_SIZE = 20;

/**
 * One dispatch cycle. `FOR UPDATE SKIP LOCKED` is what lets several of these
 * run at once (several worker replicas, or just two overlapping ticks of the
 * same process's own interval) without two of them ever claiming the same
 * row: a row already locked by another transaction is silently excluded
 * from this one's result set instead of making it wait, so the two queries
 * partition the pending set between them rather than double-claiming.
 * See docs/adr/0009-outbox-pattern.md and
 * test/integration/webhooks-and-api-keys.test.ts ("two concurrent
 * dispatches never claim the same outbox event") for the concurrency proof.
 *
 * Marking `dispatchedAt` happens inside the same transaction as the claim,
 * before the corresponding BullMQ jobs are enqueued outside of it (Redis
 * isn't part of the Postgres transaction, so the two writes can't be made
 * atomic with each other) -- see docs/adr/0009-outbox-pattern.md's
 * "Consequences" for the narrow crash window this leaves and why it's an
 * accepted trade-off for this phase.
 *
 * Returns the ids of the events this call claimed, mainly so tests and logs
 * don't have to re-derive them.
 */
export async function dispatchOutboxBatch(batchSize = DEFAULT_BATCH_SIZE): Promise<string[]> {
  const claimed = await prisma.$transaction(async (tx) => {
    const events = await tx.$queryRaw<ClaimedEvent[]>`
      SELECT id, "organizationId", type
      FROM "OutboxEvent"
      WHERE "dispatchedAt" IS NULL
      ORDER BY "createdAt"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;

    if (events.length === 0) {
      return [];
    }

    await tx.outboxEvent.updateMany({
      where: { id: { in: events.map((event) => event.id) } },
      data: { dispatchedAt: new Date(), attempts: { increment: 1 } },
    });

    return events;
  });

  if (claimed.length === 0) {
    return [];
  }

  const queue = webhookDeliveryQueue();
  for (const event of claimed) {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { organizationId: event.organizationId, enabled: true, eventTypes: { has: event.type } },
      select: { id: true },
    });

    for (const endpoint of endpoints) {
      await queue.add('deliver', { outboxEventId: event.id, webhookEndpointId: endpoint.id }, WEBHOOK_DELIVERY_JOB_OPTIONS);
    }

    logger.info({ outboxEventId: event.id, type: event.type, endpointsMatched: endpoints.length }, 'Dispatched outbox event');
  }

  return claimed.map((event) => event.id);
}

/** Polls on an interval until `stop()` is called. `stop()` resolves once any in-flight tick has finished, so shutdown never cuts a dispatch cycle in half. */
export function startOutboxDispatcher(intervalMs: number, batchSize = DEFAULT_BATCH_SIZE): { stop: () => Promise<void> } {
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();

  const timer = setInterval(() => {
    if (stopped) {
      return;
    }
    inFlight = dispatchOutboxBatch(batchSize)
      .then(() => undefined)
      .catch((error: unknown) => {
        logger.error({ err: error }, 'Outbox dispatch tick failed');
      });
  }, intervalMs);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
