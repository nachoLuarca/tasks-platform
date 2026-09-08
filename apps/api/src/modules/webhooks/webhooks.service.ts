import { randomBytes } from 'node:crypto';

import { WEBHOOK_DELIVERY_JOB_OPTIONS, webhookDeliveryQueue } from '@tasks-platform/shared';

import { prisma } from '../../shared/db/index.js';
import { buildPage, decodeCursor, type Page } from '../../shared/pagination/index.js';
import type { TaskActivityType } from '../activity/activity.types.js';
import { webhooksRepository } from './webhooks.repository.js';
import type { WebhookDeliveryEntity, WebhookEndpointEntity } from './webhooks.types.js';

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export const webhooksService = {
  async create(organizationId: string, createdById: string, url: string, eventTypes: TaskActivityType[]): Promise<{ endpoint: WebhookEndpointEntity; secret: string }> {
    const secret = generateSecret();
    const endpoint = await webhooksRepository.create({ organizationId, url, secret, eventTypes, createdById });
    return { endpoint, secret };
  },

  async list(organizationId: string): Promise<WebhookEndpointEntity[]> {
    return webhooksRepository.list(organizationId);
  },

  async update(
    endpoint: WebhookEndpointEntity,
    input: { url?: string; eventTypes?: TaskActivityType[]; enabled?: boolean },
  ): Promise<WebhookEndpointEntity> {
    return webhooksRepository.update(endpoint.id, input);
  },

  async remove(endpoint: WebhookEndpointEntity): Promise<void> {
    await webhooksRepository.remove(endpoint.id);
  },

  async rotateSecret(endpoint: WebhookEndpointEntity): Promise<{ endpoint: WebhookEndpointEntity; secret: string }> {
    const secret = generateSecret();
    const updated = await webhooksRepository.rotateSecret(endpoint.id, secret);
    return { endpoint: updated, secret };
  },

  async listDeliveries(endpoint: WebhookEndpointEntity, cursor: string | undefined, limit: number): Promise<Page<WebhookDeliveryEntity>> {
    const cursorId = cursor ? decodeCursor(cursor) : undefined;
    const rows = await webhooksRepository.listDeliveries(endpoint.id, cursorId, limit);
    return buildPage(rows, limit);
  },

  /**
   * Writes a real, throwaway OutboxEvent (type `WEBHOOK_TEST`, never
   * produced by any real domain change) and enqueues a delivery job for it
   * directly against this one endpoint -- so a test send exercises the
   * exact same signing/timeout/retry/bookkeeping path a real delivery does,
   * bypassing only the dispatcher's subscription filter (a test is sent
   * regardless of which event types the endpoint subscribes to).
   */
  async sendTestEvent(endpoint: WebhookEndpointEntity): Promise<void> {
    const event = await prisma.outboxEvent.create({
      data: {
        organizationId: endpoint.organizationId,
        type: 'WEBHOOK_TEST',
        payload: { message: 'This is a test event from Tasks Platform', endpointId: endpoint.id },
        dispatchedAt: new Date(),
      },
    });
    await webhookDeliveryQueue().add(
      'deliver',
      { outboxEventId: event.id, webhookEndpointId: endpoint.id },
      WEBHOOK_DELIVERY_JOB_OPTIONS,
    );
  },
};
