import { z } from 'zod';

/**
 * Single source of truth for the four fixed roles. Not user-configurable:
 * see PHASE.md decision 1 (Phase 2).
 */
export const roleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export type Role = z.infer<typeof roleSchema>;
