import type { Job } from 'bullmq';
import type { PasswordResetRequestJobData } from '@tasks-platform/shared';

import { handlePasswordResetRequest } from '../services/password-reset.service.js';

/** Thin, like every processor: the lookup, limit and token issuing live in the service, directly testable without a queue. */
export async function processPasswordResetRequest(job: Job<PasswordResetRequestJobData>): Promise<void> {
  await handlePasswordResetRequest(job.data.email);
}
