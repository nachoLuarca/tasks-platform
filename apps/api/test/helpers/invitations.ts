import { emailQueue, type EmailJobData } from '@tasks-platform/shared';

/**
 * Emails are queued, never sent, during the api test suite (no worker runs),
 * so the tests read the most recent matching job straight from the queue --
 * exactly as the api left it. Picks the most recent match, since the same
 * test email is often mailed more than once in the same file.
 */
async function latestQueuedEmail<T extends EmailJobData['template']>(
  email: string,
  template: T,
): Promise<Extract<EmailJobData, { template: T }> | null> {
  const jobs = await emailQueue().getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], 0, 500);
  const matches = jobs.filter((job) => job.data.to === email && job.data.template === template);
  if (matches.length === 0) {
    return null;
  }
  const latest = matches.reduce((a, b) => ((b.timestamp ?? 0) > (a.timestamp ?? 0) ? b : a));
  return latest.data as Extract<EmailJobData, { template: T }>;
}

/**
 * The invitation endpoint no longer hands the link back in its response
 * (Phase 4 closes the Phase 2 gap tracked in docs/DEBT.md) -- it queues a
 * real email instead, whose accept link carries the token as its last path
 * segment.
 */
export async function getInvitationToken(email: string): Promise<string> {
  const data = await latestQueuedEmail(email, 'invitation');
  if (!data) {
    throw new Error(`No invitation email job queued for ${email}`);
  }
  const token = new URL(data.acceptUrl).pathname.split('/').pop();
  if (!token) {
    throw new Error(`Queued invitation email for ${email} has no token in its acceptUrl`);
  }
  return token;
}

/** Account-token links carry the token in the URL fragment (`#token=...`), see buildAccountTokenLink in packages/shared. */
export function tokenFromFragmentLink(link: string): string {
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
  if (!token) {
    throw new Error(`Link has no #token fragment: ${link}`);
  }
  return token;
}

export async function getVerificationToken(email: string): Promise<string> {
  const data = await latestQueuedEmail(email, 'email-verification');
  if (!data) {
    throw new Error(`No verification email job queued for ${email}`);
  }
  return tokenFromFragmentLink(data.verifyUrl);
}

export async function countQueuedEmails(email: string, template: EmailJobData['template']): Promise<number> {
  const jobs = await emailQueue().getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], 0, 500);
  return jobs.filter((job) => job.data.to === email && job.data.template === template).length;
}
