import { signWebhookPayload, verifyWebhookSignature } from '@tasks-platform/shared';
import { describe, expect, it } from 'vitest';

describe('webhook signature', () => {
  it('validates a signature generated for the same secret and body', () => {
    const secret = 'whsec_test_secret';
    const body = JSON.stringify({ hello: 'world' });

    const { header } = signWebhookPayload(secret, body);

    expect(verifyWebhookSignature(secret, body, header)).toEqual({ ok: true });
  });

  it('fails if the body is altered after signing', () => {
    const secret = 'whsec_test_secret';
    const body = JSON.stringify({ hello: 'world' });
    const { header } = signWebhookPayload(secret, body);

    const tamperedBody = JSON.stringify({ hello: 'world', extra: 'injected' });

    expect(verifyWebhookSignature(secret, tamperedBody, header).ok).toBe(false);
  });

  it('fails against the wrong secret', () => {
    const body = JSON.stringify({ hello: 'world' });
    const { header } = signWebhookPayload('whsec_correct', body);

    expect(verifyWebhookSignature('whsec_wrong', body, header).ok).toBe(false);
  });

  it('rejects an old, replayed delivery by its timestamp', () => {
    const secret = 'whsec_test_secret';
    const body = JSON.stringify({ hello: 'world' });
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;

    const { header } = signWebhookPayload(secret, body, tenMinutesAgo);

    expect(verifyWebhookSignature(secret, body, header, 300)).toEqual({
      ok: false,
      reason: 'timestamp-outside-tolerance',
    });
  });

  it('accepts a timestamp within tolerance', () => {
    const secret = 'whsec_test_secret';
    const body = JSON.stringify({ hello: 'world' });
    const twoMinutesAgo = Math.floor(Date.now() / 1000) - 120;

    const { header } = signWebhookPayload(secret, body, twoMinutesAgo);

    expect(verifyWebhookSignature(secret, body, header, 300).ok).toBe(true);
  });

  it('rejects a malformed header', () => {
    expect(verifyWebhookSignature('whsec_test_secret', '{}', 'not-a-valid-header').ok).toBe(false);
  });
});
