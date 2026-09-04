import { z } from 'zod';

/**
 * Every input and stored value goes through this schema so the app always
 * works with the same normalized form (lowercase, trimmed).
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Email must be a valid address')
  .max(255)
  .transform((value) => value.toLowerCase());

// NIST 800-63B: no forced complexity rules, just a generous length range.
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password must be at most 128 characters long');

export const nameSchema = z.string().trim().min(1, 'Name is required').max(120);
