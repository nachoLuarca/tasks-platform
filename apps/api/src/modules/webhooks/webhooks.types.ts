import type { TaskActivityType } from '../activity/activity.types.js';

export interface WebhookEndpointEntity {
  id: string;
  organizationId: string;
  url: string;
  secret: string;
  eventTypes: TaskActivityType[];
  enabled: boolean;
  disabledReason: string | null;
  consecutiveFailures: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebhookEndpointInput {
  organizationId: string;
  url: string;
  secret: string;
  eventTypes: TaskActivityType[];
  createdById: string;
}

export interface UpdateWebhookEndpointInput {
  url?: string;
  eventTypes?: TaskActivityType[];
  enabled?: boolean;
}

export interface WebhookDeliveryEntity {
  id: string;
  endpointId: string;
  outboxEventId: string;
  attempt: number;
  statusCode: number | null;
  responseSnippet: string | null;
  error: string | null;
  durationMs: number;
  createdAt: Date;
}
