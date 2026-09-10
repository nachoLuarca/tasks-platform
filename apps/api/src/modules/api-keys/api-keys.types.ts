import type { Permission } from '../../shared/authorization/index.js';

/** Visible prefix every key starts with, so `requireAuth` can tell an API key apart from a JWT (PHASE.md decision 7). */
export const API_KEY_PREFIX = 'tp_live_';

/** How many characters of the full key (prefix included) are kept as the displayed `prefix` -- enough to tell keys apart in a listing, nowhere near enough to reconstruct the key. */
export const DISPLAYED_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export interface ApiKeyEntity {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: Permission[];
  createdById: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreateApiKeyInput {
  organizationId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: Permission[];
  createdById: string;
  expiresAt?: Date;
}
