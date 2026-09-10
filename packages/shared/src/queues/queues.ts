import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';

import { createQueueConnection } from '../db/index.js';

/**
 * Names shared by every producer (api, or the dispatcher inside the worker)
 * and consumer (the worker's processors) so nobody typos a queue name in one
 * place and creates a second, orphaned queue by accident.
 */
export const QUEUE_NAMES = {
  webhookDelivery: 'webhook-delivery',
  email: 'email',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Up to 5 attempts with growing backoff, per PHASE.md decision 5, for webhook deliveries. */
export const WEBHOOK_DELIVERY_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 7 * 24 * 60 * 60 },
  removeOnFail: { age: 30 * 24 * 60 * 60 },
};

/** Emails aren't part of the outbox/webhook retry guarantee PHASE.md asks for; a few quick retries is enough to ride out a momentary SMTP hiccup. */
export const EMAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 7 * 24 * 60 * 60 },
  removeOnFail: { age: 30 * 24 * 60 * 60 },
};

let connection: ConnectionOptions | undefined;
function sharedConnection(): ConnectionOptions {
  connection ??= createQueueConnection();
  return connection;
}

export interface WebhookDeliveryJobData {
  outboxEventId: string;
  webhookEndpointId: string;
}

export interface InvitationEmailJobData {
  to: string;
  organizationName: string;
  invitedByName: string;
  role: string;
  acceptUrl: string;
}

/**
 * Producers (the api for emails, the worker's dispatcher for webhook
 * deliveries) create their own `Queue` instance lazily, from this one
 * connection, rather than importing a singleton `Queue` object -- so a
 * process that only ever produces (the api never runs a Worker) doesn't pay
 * for a BullMQ Worker's polling loop it will never use.
 */
export function webhookDeliveryQueue(): Queue<WebhookDeliveryJobData> {
  return new Queue<WebhookDeliveryJobData>(QUEUE_NAMES.webhookDelivery, { connection: sharedConnection() });
}

export function emailQueue(): Queue<InvitationEmailJobData> {
  return new Queue<InvitationEmailJobData>(QUEUE_NAMES.email, { connection: sharedConnection() });
}
