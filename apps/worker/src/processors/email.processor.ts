import type { Job } from 'bullmq';
import type { InvitationEmailJobData } from '@tasks-platform/shared';

import { sendInvitationEmail } from '../services/email.service.js';

export async function processEmail(job: Job<InvitationEmailJobData>): Promise<void> {
  await sendInvitationEmail(job.data);
}
