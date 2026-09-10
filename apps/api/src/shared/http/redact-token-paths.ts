/**
 * Routes that carry a live credential as a path segment. The whole path of
 * every request goes to the access log (and, for an unknown route, into the
 * 404 message), so these segments are masked before anything is written.
 * A route that puts a token in its path must be listed here.
 */
const TOKEN_PATH_PATTERNS: readonly RegExp[] = [
  // GET /v1/auth/reset-password/:token (Phase 4.5)
  /^(\/v1\/auth\/reset-password\/)[^/?#]+/,
  // GET /v1/invitations/:token and POST /v1/invitations/:token/accept (Phase 2)
  /^(\/v1\/invitations\/)[^/?#]+/,
];

export const REDACTED_SEGMENT = '[REDACTED]';

export function redactTokenPaths(url: string): string {
  return TOKEN_PATH_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, `$1${REDACTED_SEGMENT}`), url);
}
