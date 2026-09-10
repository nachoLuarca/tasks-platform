import { Worker } from 'bullmq';
import { createQueueConnection, prisma, redis, QUEUE_NAMES, type WebhookDeliveryJobData, type EmailJobData } from '@tasks-platform/shared';

import { config } from './config/index.js';
import { startOutboxDispatcher } from './dispatcher/outbox-dispatcher.js';
import { startHealthServer } from './health-server.js';
import { logger } from './logger.js';
import { processEmail } from './processors/email.processor.js';
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

const dispatcher = startOutboxDispatcher(config.outboxPollIntervalMs);

logger.info({ port: config.port }, 'Worker started: dispatching outbox, delivering webhooks, sending email');

/** Waits for in-flight jobs to finish (bounded by SHUTDOWN_TIMEOUT_MS-equivalent default BullMQ close behavior) before exiting, per PHASE.md's "apagado ordenado". */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutting down');
  try {
    await dispatcher.stop();
    await Promise.all([webhookDeliveryWorker.close(), emailWorker.close()]);
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
