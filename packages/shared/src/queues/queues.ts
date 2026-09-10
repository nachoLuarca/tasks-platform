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

/**
 * For emails whose job data carries a live account token (verification,
 * password reset): same retries, but a sent job is dropped from Redis right
 * away and a failed one is kept only a day, instead of leaving usable tokens
 * sitting in Redis for a week or a month for debugging convenience.
 */
export const ACCOUNT_EMAIL_JOB_OPTIONS: JobsOptions = {
  ...EMAIL_JOB_OPTIONS,
  removeOnComplete: true,
  removeOnFail: { age: 24 * 60 * 60 },
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

/** Every email job names its `template`, so the worker's single email processor knows which one to render. */
export interface InvitationEmailJobData {
  template: 'invitation';
  to: string;
  organizationName: string;
  invitedByName: string;
  role: string;
  acceptUrl: string;
}

export interface EmailVerificationEmailJobData {
  template: 'email-verification';
  to: string;
  name: string;
  verifyUrl: string;
}

export type EmailJobData = InvitationEmailJobData | EmailVerificationEmailJobData;

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

export function emailQueue(): Queue<EmailJobData> {
  return new Queue<EmailJobData>(QUEUE_NAMES.email, { connection: sharedConnection() });
}
