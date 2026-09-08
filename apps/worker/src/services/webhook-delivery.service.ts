import { prisma, sharedConfig, signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from '@tasks-platform/shared';

import { logger } from '../logger.js';

const RESPONSE_SNIPPET_MAX_LENGTH = 500;

export interface DeliverWebhookParams {
  outboxEventId: string;
  webhookEndpointId: string;
  /** 1-based: the first attempt of a chain is 1, matching what a human reading WebhookDelivery rows expects. */
  attemptNumber: number;
}

export interface DeliveryResult {
  /** `false` only when the HTTP call itself failed or came back non-2xx -- never for a missing event/endpoint, see below. */
  success: boolean;
  statusCode: number | null;
  error: string | null;
}

/**
 * Performs exactly one delivery attempt: signs the payload, POSTs it with a
 * timeout, records a `WebhookDelivery` row with what happened, and reports
 * whether it succeeded. Doesn't retry itself -- that's BullMQ's job
 * (attempts + backoff, see processors/webhook-delivery.processor.ts). Kept
 * as a plain function, not a queue handler, so it's directly callable from
 * a test without spinning up a real queue (PHASE.md's "la lógica de entrega
 * va en servicios, no dentro del manejador de la cola").
 */
export async function deliverWebhookAttempt(params: DeliverWebhookParams): Promise<DeliveryResult> {
  const event = await prisma.outboxEvent.findUnique({ where: { id: params.outboxEventId } });
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: params.webhookEndpointId } });

  if (!event || !endpoint || !endpoint.enabled) {
    // Nothing to retry: the event/endpoint was removed, or the endpoint got
    // disabled between being queued and being processed. Reported as a
    // (vacuous) success so the job doesn't retry against something that no
    // longer exists.
    logger.warn({ ...params }, 'Skipping webhook delivery: event or endpoint no longer exists/enabled');
    return { success: true, statusCode: null, error: null };
  }

  const body = JSON.stringify(event.payload);
  const { header } = signWebhookPayload(endpoint.secret, body);

  const start = Date.now();
  let statusCode: number | null = null;
  let responseSnippet: string | null = null;
  let errorMessage: string | null = null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sharedConfig.webhook.deliveryTimeoutMs);
  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event.type,
        [WEBHOOK_SIGNATURE_HEADER]: header,
      },
      body,
      signal: controller.signal,
    });
    statusCode = response.status;
    const text = await response.text();
    responseSnippet = text.slice(0, RESPONSE_SNIPPET_MAX_LENGTH);
    if (!response.ok) {
      errorMessage = `Endpoint responded with HTTP ${response.status}`;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown delivery error';
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Date.now() - start;
  const success = errorMessage === null;

  await prisma.webhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      outboxEventId: event.id,
      attempt: params.attemptNumber,
      statusCode,
      responseSnippet,
      error: errorMessage,
      durationMs,
    },
  });

  if (success && endpoint.consecutiveFailures !== 0) {
    await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { consecutiveFailures: 0 } });
  }

  return { success, statusCode, error: errorMessage };
}

/**
 * Called once per delivery *chain* that exhausts every attempt without ever
 * succeeding (see processors/webhook-delivery.processor.ts) -- PHASE.md
 * decision 5: `WEBHOOK_MAX_CONSECUTIVE_FAILURES` such chains in a row and
 * the endpoint disables itself, recording why.
 */
export async function recordChainExhausted(webhookEndpointId: string): Promise<void> {
  const endpoint = await prisma.webhookEndpoint.update({
    where: { id: webhookEndpointId },
    data: { consecutiveFailures: { increment: 1 } },
  });

  if (endpoint.enabled && endpoint.consecutiveFailures >= sharedConfig.webhook.maxConsecutiveFailures) {
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        enabled: false,
        disabledReason: `Disabled automatically after ${endpoint.consecutiveFailures} consecutive failed deliveries`,
      },
    });
    logger.warn({ webhookEndpointId, consecutiveFailures: endpoint.consecutiveFailures }, 'Webhook endpoint disabled automatically');
  }
}
