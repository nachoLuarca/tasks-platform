import { createHmac, timingSafeEqual } from 'node:crypto';

import { sharedConfig } from '../config/index.js';

/**
 * Stripe-style webhook signing: HMAC-SHA256 over `${timestamp}.${body}`,
 * carried in a header shaped like `t=<unix seconds>,v1=<hex hmac>`. The
 * timestamp is part of what's signed -- not just alongside it -- so an
 * attacker who captures a valid delivery can't replay it verbatim after
 * shifting the timestamp: the signature would no longer match. See
 * docs/adr/0010-webhook-signing.md.
 */
export const WEBHOOK_SIGNATURE_HEADER = 'X-Webhook-Signature';

export interface WebhookSignature {
  timestamp: number;
  signature: string;
  header: string;
}

function computeHmac(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function signWebhookPayload(
  secret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): WebhookSignature {
  const signature = computeHmac(secret, timestamp, body);
  return { timestamp, signature, header: `t=${timestamp},v1=${signature}` };
}

export type WebhookSignatureVerification =
  | { ok: true }
  | { ok: false; reason: 'malformed-header' | 'signature-mismatch' | 'timestamp-outside-tolerance' };

/**
 * Verifies a signature header against the raw body it was computed over.
 * The consumer of a webhook is meant to call this (see the README's
 * integration guide for Node and PHP examples), but it lives here rather
 * than only in a doc snippet so the same logic backs the delivery tests
 * (docs are a copy of real, tested code, not the other way around).
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  toleranceSeconds: number = sharedConfig.webhook.signatureToleranceSeconds,
  now: number = Math.floor(Date.now() / 1000),
): WebhookSignatureVerification {
  const parts = new Map(
    header.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value] as [string, string | undefined];
    }),
  );
  const timestampRaw = parts.get('t');
  const signature = parts.get('v1');
  if (!timestampRaw || !signature) {
    return { ok: false, reason: 'malformed-header' };
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: 'malformed-header' };
  }

  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp-outside-tolerance' };
  }

  const expected = computeHmac(secret, timestamp, body);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { ok: false, reason: 'signature-mismatch' };
  }

  return { ok: true };
}
