import { prisma, type DbClient } from '../../shared/db/index.js';
import type { TaskActivityType } from '../activity/activity.types.js';
import type {
  CreateWebhookEndpointInput,
  UpdateWebhookEndpointInput,
  WebhookDeliveryEntity,
  WebhookEndpointEntity,
} from './webhooks.types.js';

type EndpointRow = {
  id: string;
  organizationId: string;
  url: string;
  secret: string;
  eventTypes: string[];
  enabled: boolean;
  disabledReason: string | null;
  consecutiveFailures: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

type DeliveryRow = {
  id: string;
  endpointId: string;
  outboxEventId: string;
  attempt: number;
  statusCode: number | null;
  responseSnippet: string | null;
  error: string | null;
  durationMs: number;
  createdAt: Date;
};

function toEndpointEntity(row: EndpointRow): WebhookEndpointEntity {
  return { ...row, eventTypes: row.eventTypes as TaskActivityType[] };
}

function toDeliveryEntity(row: DeliveryRow): WebhookDeliveryEntity {
  return { ...row };
}

export const webhooksRepository = {
  async create(input: CreateWebhookEndpointInput, client: DbClient = prisma): Promise<WebhookEndpointEntity> {
    const row = await client.webhookEndpoint.create({ data: input });
    return toEndpointEntity(row);
  },

  async findById(id: string, organizationId: string, client: DbClient = prisma): Promise<WebhookEndpointEntity | null> {
    const row = await client.webhookEndpoint.findFirst({ where: { id, organizationId } });
    return row ? toEndpointEntity(row) : null;
  },

  async list(organizationId: string, client: DbClient = prisma): Promise<WebhookEndpointEntity[]> {
    const rows = await client.webhookEndpoint.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
    return rows.map(toEndpointEntity);
  },

  async update(id: string, input: UpdateWebhookEndpointInput, client: DbClient = prisma): Promise<WebhookEndpointEntity> {
    // Manually re-enabling clears the auto-disable state: a fresh chance to
    // prove itself, not 20 failures away from being disabled again instantly.
    const resetFailureState = input.enabled === true ? { consecutiveFailures: 0, disabledReason: null } : {};
    const row = await client.webhookEndpoint.update({ where: { id }, data: { ...input, ...resetFailureState } });
    return toEndpointEntity(row);
  },

  async rotateSecret(id: string, secret: string, client: DbClient = prisma): Promise<WebhookEndpointEntity> {
    const row = await client.webhookEndpoint.update({ where: { id }, data: { secret } });
    return toEndpointEntity(row);
  },

  async remove(id: string, client: DbClient = prisma): Promise<void> {
    await client.webhookEndpoint.delete({ where: { id } });
  },

  async listDeliveries(
    endpointId: string,
    cursorId: string | undefined,
    limit: number,
    client: DbClient = prisma,
  ): Promise<WebhookDeliveryEntity[]> {
    const rows = await client.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      take: limit + 1,
    });
    return rows.map(toDeliveryEntity);
  },
};
