import { z } from 'zod';

/**
 * RFC 9457 Problem Details, exactly as apps/api's error middleware renders
 * every error response (`application/problem+json`). The middleware's own
 * return type is inferred from these schemas, so the documented shape and
 * the one actually sent can't drift apart.
 */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  /** The request id of the failed request, the same one that appears in its logs. */
  instance: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/** Zod's `error.flatten()`: errors not tied to a field, and errors per field. */
export const validationErrorsSchema = z.object({
  formErrors: z.array(z.string()),
  fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
});
export type ValidationErrors = z.infer<typeof validationErrorsSchema>;

/** A 400 for an invalid body or query string also says which fields failed and why. */
export const validationProblemDetailsSchema = problemDetailsSchema.extend({
  errors: validationErrorsSchema.optional(),
});
export type ValidationProblemDetails = z.infer<typeof validationProblemDetailsSchema>;
