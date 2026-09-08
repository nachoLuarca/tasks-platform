import type { Job } from 'bullmq';
import type { WebhookDeliveryJobData } from '@tasks-platform/shared';

import { deliverWebhookAttempt } from '../services/webhook-delivery.service.js';

/**
 * The queue handler itself stays thin: resolve the attempt number BullMQ is
 * on, delegate to the service for the actual work, and turn a failed
 * delivery into a thrown error so BullMQ's own attempts+backoff retries it.
 * `job.attemptsMade` is how many attempts have already run *before* this
 * one, so it's 0 on the first try -- `+ 1` gives the 1-based attempt number
 * `WebhookDelivery` rows are keyed on.
 */
export async function processWebhookDelivery(job: Job<WebhookDeliveryJobData>): Promise<void> {
  const attemptNumber = job.attemptsMade + 1;
  const result = await deliverWebhookAttempt({ ...job.data, attemptNumber });

  if (!result.success) {
    throw new Error(result.error ?? 'Webhook delivery failed');
  }
}
