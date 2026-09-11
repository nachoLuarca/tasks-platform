import { emailQueue } from '@tasks-platform/shared';

/**
 * The invitation endpoint no longer hands the link back in its response
 * (Phase 4 closes the Phase 2 gap tracked in docs/DEBT.md) -- it queues a
 * real email instead. Tests read the queued job directly: the api suite runs
 * no worker, and even with the docker worker up, a sent invitation job stays
 * in Redis as `completed` (EMAIL_JOB_OPTIONS), so it can always be found.
 * Picks the most recent matching job, since the same test email is often
 * invited more than once across different `it()` blocks in the same file.
 */
export async function getInvitationToken(email: string): Promise<string> {
  const jobs = await emailQueue().getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], 0, 500);
  const matches = jobs.filter((job) => job.data.template === 'invitation' && job.data.to === email);
  if (matches.length === 0) {
    throw new Error(`No invitation email job queued for ${email}`);
  }
  const latest = matches.reduce((a, b) => ((b.timestamp ?? 0) > (a.timestamp ?? 0) ? b : a));
  if (latest.data.template !== 'invitation') {
    throw new Error('unreachable: filtered on template above');
  }

  const token = new URL(latest.data.acceptUrl).pathname.split('/').pop();
  if (!token) {
    throw new Error(`Queued invitation email for ${email} has no token in its acceptUrl`);
  }
  return token;
}
