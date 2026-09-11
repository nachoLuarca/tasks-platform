import { Worker } from 'bullmq';
import {
  createQueueConnection,
  prisma,
  redis,
  QUEUE_NAMES,
  type EmailJobData,
  type PasswordResetRequestJobData,
  type WebhookDeliveryJobData,
} from '@tasks-platform/shared';

import { config } from './config/index.js';
import { startOutboxDispatcher } from './dispatcher/outbox-dispatcher.js';
import { startHealthServer } from './health-server.js';
import { logger } from './logger.js';
import { processEmail } from './processors/email.processor.js';
import { processPasswordResetRequest } from './processors/password-reset-request.processor.js';
import { processWebhookDelivery } from './processors/webhook-delivery.processor.js';
import { recordChainExhausted } from './services/webhook-delivery.service.js';

const healthServer = startHealthServer();

const webhookDeliveryWorker = new Worker<WebhookDeliveryJobData>(QUEUE_NAMES.webhookDelivery, processWebhookDelivery, {
  connection: createQueueConnection(),
  concurrency: 10,
});

// A chain is "exhausted" the instant BullMQ reports a failure at the last
// configured attempt -- see webhook-delivery.service.ts's recordChainExhausted
// for what that increments and PHASE.md decision 5 for the 20-in-a-row rule.
webhookDeliveryWorker.on('failed', (job, error) => {
  if (!job) {
    return;
  }
  logger.warn({ jobId: job.id, attemptsMade: job.attemptsMade, err: error }, 'Webhook delivery attempt failed');

  const attemptsLimit = job.opts.attempts ?? 1;
  if (job.attemptsMade >= attemptsLimit) {
    void recordChainExhausted(job.data.webhookEndpointId).catch((chainError: unknown) => {
      logger.error({ err: chainError, webhookEndpointId: job.data.webhookEndpointId }, 'Failed to record exhausted delivery chain');
    });
  }
});

const emailWorker = new Worker<EmailJobData>(QUEUE_NAMES.email, processEmail, {
  connection: createQueueConnection(),
  concurrency: 5,
});

emailWorker.on('failed', (job, error) => {
  logger.warn({ jobId: job?.id, err: error }, 'Email delivery attempt failed');
});

// Job data is only ever referenced by id in logs: it's an email address
// someone typed, which may not even belong to an account.
const passwordResetRequestWorker = new Worker<PasswordResetRequestJobData>(
  QUEUE_NAMES.passwordResetRequest,
  processPasswordResetRequest,
  { connection: createQueueConnection(), concurrency: 5 },
);

passwordResetRequestWorker.on('failed', (job, error) => {
  logger.warn({ jobId: job?.id, err: error }, 'Password reset request processing failed');
});

const dispatcher = startOutboxDispatcher(config.outboxPollIntervalMs);

logger.info({ port: config.port }, 'Worker started: dispatching outbox, delivering webhooks, sending email, handling password reset requests');

/** Waits for in-flight jobs to finish (bounded by SHUTDOWN_TIMEOUT_MS-equivalent default BullMQ close behavior) before exiting, per PHASE.md's "apagado ordenado". */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutting down');
  try {
    await dispatcher.stop();
    await Promise.all([webhookDeliveryWorker.close(), emailWorker.close(), passwordResetRequestWorker.close()]);
    await new Promise<void>((resolve, reject) => {
      healthServer.close((error) => (error ? reject(error) : resolve()));
    });
    await Promise.all([prisma.$disconnect(), redis.quit()]);
    logger.info('Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
