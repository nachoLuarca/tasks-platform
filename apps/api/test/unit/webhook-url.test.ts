import { describe, expect, it } from 'vitest';

import { assertWebhookUrlAllowed } from '../../src/modules/webhooks/webhook-url.js';

const allowed = ['https://example.com/hooks', 'https://hooks.example.com:8443/a?b=1', 'https://8.8.8.8/h', 'https://[2606:4700::1111]/h'];

const refused = [
  ['plain http', 'http://example.com/hooks'],
  ['an unparseable value', 'not a url'],
  ['credentials in the URL', 'https://user:pass@example.com/'],
  ['localhost', 'https://localhost/h'],
  ['a subdomain of localhost', 'https://api.localhost/h'],
  ['a .internal name', 'https://metadata.google.internal/h'],
  ['a .local name', 'https://printer.local/h'],
  ['IPv4 loopback', 'https://127.0.0.1/h'],
  ['IPv4 loopback, decimal form', 'https://2130706433/h'],
  ['IPv4 loopback, hex form', 'https://0x7f.1/h'],
  ['the cloud metadata address', 'https://169.254.169.254/latest/meta-data'],
  ['a 10/8 address', 'https://10.0.0.5/h'],
  ['a 172.16/12 address', 'https://172.20.1.1/h'],
  ['a 192.168/16 address', 'https://192.168.1.1/h'],
  ['a carrier-grade NAT address', 'https://100.64.0.1/h'],
  ['0.0.0.0', 'https://0.0.0.0/h'],
  ['IPv6 loopback', 'https://[::1]/h'],
  ['IPv6 unique local', 'https://[fd00::1]/h'],
  ['IPv6 link-local', 'https://[fe80::1]/h'],
  ['IPv4-mapped IPv6 loopback', 'https://[::ffff:127.0.0.1]/h'],
  ['IPv4-mapped IPv6 metadata address', 'https://[::ffff:a9fe:a9fe]/h'],
] as const;

describe('assertWebhookUrlAllowed', () => {
  it.each(allowed)('accepts %s', (url) => {
    expect(() => assertWebhookUrlAllowed(url, false)).not.toThrow();
  });

  it.each(refused)('refuses %s', (_label, url) => {
    expect(() => assertWebhookUrlAllowed(url, false)).toThrow();
  });

  it('accepts anything when private URLs are explicitly allowed (local development)', () => {
    expect(() => assertWebhookUrlAllowed('http://localhost:4000/hook', true)).not.toThrow();
  });
});
