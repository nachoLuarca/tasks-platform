import type { Job } from 'bullmq';
import type { EmailJobData } from '@tasks-platform/shared';

import { sendEmailVerificationEmail, sendInvitationEmail, sendPasswordResetEmail } from '../services/email.service.js';

/** One queue, one processor: `template` picks the renderer. A thrown send error lets BullMQ retry per the job's options. */
export async function processEmail(job: Job<EmailJobData>): Promise<void> {
  const { data } = job;
  switch (data.template) {
    case 'invitation':
      await sendInvitationEmail(data);
      return;
    case 'email-verification':
      await sendEmailVerificationEmail(data);
      return;
    case 'password-reset':
      await sendPasswordResetEmail(data);
      return;
  }
}
