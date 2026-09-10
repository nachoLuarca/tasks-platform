import { z } from 'zod';

/**
 * `scopes` is validated only for shape here (non-empty strings); which ones
 * are actually grantable to an API key is an apps/api-only concern (see
 * shared/authorization/api-key-scopes.ts) -- contracts doesn't know the
 * permission vocabulary, only apps/api does, so the real check happens in
 * apiKeysService.create and comes back as a 422 if a scope isn't allowed.
 */
export const createApiKeyRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  scopes: z.array(z.string().min(1)).min(1, 'At least one scope is required').max(20),
  expiresAt: z.string().datetime().optional(),
});
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

export const apiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;

/** Only the create response carries the full, usable key -- never shown again after this. */
export const apiKeyCreatedResponseSchema = apiKeyResponseSchema.extend({ key: z.string() });
export type ApiKeyCreatedResponse = z.infer<typeof apiKeyCreatedResponseSchema>;

export const apiKeyListResponseSchema = z.array(apiKeyResponseSchema);
export type ApiKeyListResponse = z.infer<typeof apiKeyListResponseSchema>;
