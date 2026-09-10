import { prisma, webhookDeliveryQueue } from '@tasks-platform/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { dispatchOutboxBatch } from '../../src/dispatcher/outbox-dispatcher.js';
import { resetWebhookState } from '../helpers/db.js';
import { createTestOrganization } from '../helpers/fixtures.js';

beforeEach(async () => {
  await resetWebhookState();
  await webhookDeliveryQueue().obliterate({ force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('outbox dispatcher', () => {
  it('only enqueues a delivery job for endpoints subscribed to that event type', async () => {
    const { organizationId, userId } = await createTestOrganization();
    const subscribed = await prisma.webhookEndpoint.create({
      data: {
        organizationId,
        url: 'http://example.invalid/subscribed',
        secret: 'whsec_a',
        eventTypes: ['STATUS_CHANGED'],
        createdById: userId,
      },
    });
    await prisma.webhookEndpoint.create({
      data: {
        organizationId,
        url: 'http://example.invalid/not-subscribed',
        secret: 'whsec_b',
        eventTypes: ['TASK_CREATED'],
        createdById: userId,
      },
    });
    await prisma.outboxEvent.create({ data: { organizationId, type: 'STATUS_CHANGED', payload: { hello: 'world' } } });

    await dispatchOutboxBatch();

    const jobs = await webhookDeliveryQueue().getJobs(['waiting', 'delayed', 'active']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data.webhookEndpointId).toBe(subscribed.id);
  });

  it('does not enqueue anything for a disabled endpoint', async () => {
    const { organizationId, userId } = await createTestOrganization();
    await prisma.webhookEndpoint.create({
      data: {
        organizationId,
        url: 'http://example.invalid/disabled',
        secret: 'whsec_a',
        eventTypes: ['TASK_CREATED'],
        createdById: userId,
        enabled: false,
        disabledReason: 'test setup',
      },
    });
    await prisma.outboxEvent.create({ data: { organizationId, type: 'TASK_CREATED', payload: {} } });

    await dispatchOutboxBatch();

    const jobs = await webhookDeliveryQueue().getJobs(['waiting', 'delayed', 'active']);
    expect(jobs).toHaveLength(0);
  });

  it('two concurrent dispatches never claim the same outbox event', async () => {
    const { organizationId } = await createTestOrganization();
    const events = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        prisma.outboxEvent.create({ data: { organizationId, type: 'TASK_CREATED', payload: { index } } }),
      ),
    );

    const [firstBatch, secondBatch] = await Promise.all([dispatchOutboxBatch(7), dispatchOutboxBatch(7)]);

    const overlap = firstBatch.filter((id) => secondBatch.includes(id));
    expect(overlap).toHaveLength(0);

    const claimedIds = [...firstBatch, ...secondBatch].sort();
    expect(claimedIds).toEqual(events.map((event) => event.id).sort());

    const stillPending = await prisma.outboxEvent.count({ where: { organizationId, dispatchedAt: null } });
    expect(stillPending).toBe(0);
  });
});
