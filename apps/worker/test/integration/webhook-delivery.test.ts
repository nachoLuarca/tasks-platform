import { prisma, sharedConfig } from '@tasks-platform/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deliverWebhookAttempt, recordChainExhausted } from '../../src/services/webhook-delivery.service.js';
import { resetWebhookState } from '../helpers/db.js';
import { createTestOrganization } from '../helpers/fixtures.js';
import { startTestReceiver, type TestReceiver } from '../helpers/http-receiver.js';

let receiver: TestReceiver;

beforeEach(async () => {
  await resetWebhookState();
  receiver = await startTestReceiver(200);
});

afterEach(async () => {
  await receiver.close();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createEndpointAndEvent(url: string) {
  const { organizationId, userId } = await createTestOrganization();
  const endpoint = await prisma.webhookEndpoint.create({
    data: { organizationId, url, secret: 'whsec_test_secret', eventTypes: ['TASK_CREATED'], createdById: userId },
  });
  const event = await prisma.outboxEvent.create({
    data: { organizationId, type: 'TASK_CREATED', payload: { hello: 'world' } },
  });
  return { endpoint, event };
}

describe('webhook delivery', () => {
  it('delivers successfully with a verifiable signature header and records the attempt', async () => {
    const { endpoint, event } = await createEndpointAndEvent(receiver.url);

    const result = await deliverWebhookAttempt({ outboxEventId: event.id, webhookEndpointId: endpoint.id, attemptNumber: 1 });

    expect(result.success).toBe(true);
    expect(receiver.requests).toHaveLength(1);
    expect(receiver.requests[0]?.headers['x-webhook-signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(receiver.requests[0]?.body).toBe(JSON.stringify(event.payload));

    const deliveries = await prisma.webhookDelivery.findMany({ where: { endpointId: endpoint.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ attempt: 1, statusCode: 200, error: null });
  });

  it('retries a failing endpoint and records every single attempt', async () => {
    receiver.setResponseStatus(500);
    const { endpoint, event } = await createEndpointAndEvent(receiver.url);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await deliverWebhookAttempt({ outboxEventId: event.id, webhookEndpointId: endpoint.id, attemptNumber: attempt });
      expect(result.success).toBe(false);
    }

    expect(receiver.requests).toHaveLength(5);
    const deliveries = await prisma.webhookDelivery.findMany({ where: { endpointId: endpoint.id }, orderBy: { attempt: 'asc' } });
    expect(deliveries.map((delivery) => delivery.attempt)).toEqual([1, 2, 3, 4, 5]);
    expect(deliveries.every((delivery) => delivery.statusCode === 500 && delivery.error)).toBe(true);
  });

  it('a successful delivery resets the consecutive-failure counter', async () => {
    const { endpoint, event } = await createEndpointAndEvent(receiver.url);
    await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { consecutiveFailures: 3 } });

    await deliverWebhookAttempt({ outboxEventId: event.id, webhookEndpointId: endpoint.id, attemptNumber: 1 });

    const updated = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(updated.consecutiveFailures).toBe(0);
  });

  it('a disabled endpoint is skipped without an HTTP call', async () => {
    const { endpoint, event } = await createEndpointAndEvent(receiver.url);
    await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { enabled: false, disabledReason: 'test' } });

    await deliverWebhookAttempt({ outboxEventId: event.id, webhookEndpointId: endpoint.id, attemptNumber: 1 });

    expect(receiver.requests).toHaveLength(0);
  });

  it(`disables an endpoint after ${sharedConfig.webhook.maxConsecutiveFailures} consecutive exhausted delivery chains`, async () => {
    const { endpoint } = await createEndpointAndEvent(receiver.url);

    for (let i = 0; i < sharedConfig.webhook.maxConsecutiveFailures - 1; i += 1) {
      await recordChainExhausted(endpoint.id);
    }
    const stillEnabled = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(stillEnabled.enabled).toBe(true);

    await recordChainExhausted(endpoint.id);

    const disabled = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(disabled.enabled).toBe(false);
    expect(disabled.disabledReason).toContain('consecutive');
  });
});
