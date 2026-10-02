import { isIPv4, isIPv6 } from 'node:net';

import { config } from '../../shared/config/index.js';
import { UnprocessableEntityError } from '../../shared/errors/index.js';

/** Host suffixes that only ever resolve inside a network (or to the machine itself). */
const INTERNAL_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.lan', '.home.arpa'];

function isPrivateIPv4(octets: readonly number[]): boolean {
  const [a = 0, b = 0, c = 0] = octets;
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. the cloud metadata address
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expands an IPv6 literal (no brackets, no zone) to its eight 16-bit groups. */
function expandIPv6(address: string): number[] {
  const [head = '', tail] = address.split('::');
  const toGroups = (part: string): number[] => (part === '' ? [] : part.split(':').flatMap(parseGroup));
  const headGroups = toGroups(head);
  const tailGroups = tail === undefined ? [] : toGroups(tail);
  if (tail === undefined) {
    return headGroups;
  }
  return [...headGroups, ...new Array<number>(8 - headGroups.length - tailGroups.length).fill(0), ...tailGroups];
}

/** A group is hex, except a trailing dotted IPv4 (`::ffff:1.2.3.4`), which stands for two groups. */
function parseGroup(group: string): number[] {
  if (group.includes('.')) {
    const [a = 0, b = 0, c = 0, d = 0] = group.split('.').map(Number);
    return [(a << 8) | b, (c << 8) | d];
  }
  return [Number.parseInt(group, 16)];
}

function isPrivateIPv6(address: string): boolean {
  const groups = expandIPv6(address);
  const [g0 = 0] = groups;
  const isMappedIPv4 = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (isMappedIPv4) {
    const [hi = 0, lo = 0] = groups.slice(6);
    return isPrivateIPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }
  const isUnspecifiedOrLoopback = groups.slice(0, 7).every((g) => g === 0) && (groups[7] === 0 || groups[7] === 1);
  return (
    isUnspecifiedOrLoopback ||
    (g0 & 0xfe00) === 0xfc00 || // unique local, fc00::/7
    (g0 & 0xffc0) === 0xfe80 || // link-local, fe80::/10
    (g0 & 0xff00) === 0xff00 // multicast
  );
}

/**
 * Where a webhook may point. The worker POSTs to this URL from inside the
 * service's network and the delivery log shows the response, so an address
 * that reaches loopback, a private network or the cloud metadata service
 * would turn the endpoint into a window onto internal systems (SSRF). A
 * literal address or an obviously internal name is refused here; a public
 * name that resolves to a private address (DNS rebinding) is not caught --
 * see docs/security-audit.md, SEC-02.
 *
 * `WEBHOOK_ALLOW_PRIVATE_URLS` switches the whole check off for local
 * development, where the receiver is a process on localhost.
 */
export function assertWebhookUrlAllowed(rawUrl: string, allowPrivate: boolean = config.webhooks.allowPrivateUrls): void {
  if (allowPrivate) {
    return;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnprocessableEntityError('The webhook URL is not valid');
  }

  if (url.protocol !== 'https:') {
    throw new UnprocessableEntityError('The webhook URL must use https');
  }
  if (url.username !== '' || url.password !== '') {
    throw new UnprocessableEntityError('The webhook URL must not contain credentials');
  }

  // WHATWG URL already normalizes decimal/hex/octal IPv4 forms to dotted quads.
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const bareHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  const isInternalName = bareHost === 'localhost' || INTERNAL_HOST_SUFFIXES.some((suffix) => bareHost.endsWith(suffix));
  const isPrivateAddress =
    (isIPv4(bareHost) && isPrivateIPv4(bareHost.split('.').map(Number))) ||
    (isIPv6(bareHost) && isPrivateIPv6(bareHost));

  if (isInternalName || isPrivateAddress) {
    throw new UnprocessableEntityError('The webhook URL must point to a public address');
  }
}
