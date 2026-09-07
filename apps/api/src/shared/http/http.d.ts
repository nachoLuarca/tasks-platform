import 'node:http';

import type { Role } from '@tasks-platform/contracts';

declare module 'node:http' {
  interface IncomingMessage {
    id: string;
    auth?: { userId: string };
    /** Set by `requireMembership` once the caller's role in the org is resolved. */
    membership?: { organizationId: string; membershipId: string; role: Role };
  }
}

export {};
