import { emailQueue } from '@tasks-platform/shared';

/**
 * The invitation endpoint no longer hands the link back in its response
 * (Phase 4 closes the Phase 2 gap tracked in docs/DEBT.md) -- it queues a
 * real email instead. Tests that used to read `invitationUrl` off the
 * response body now read the queued job directly: no worker runs during
 * the test suite, so the job sits in the queue exactly as the api left it.
 * Picks the most recent matching job, since the same test email is often
 * invited more than once across different `it()` blocks in the same file.
 */
export async function getInvitationToken(email: string): Promise<string> {
  const queue = emailQueue();
  const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], 0, 200);
  const matches = jobs.filter((job) => job.data.to === email);
  if (matches.length === 0) {
    throw new Error(`No invitation email job queued for ${email}`);
  }
  const latest = matches.reduce((a, b) => ((b.timestamp ?? 0) > (a.timestamp ?? 0) ? b : a));

  const token = new URL(latest.data.acceptUrl).pathname.split('/').pop();
  if (!token) {
    throw new Error(`Queued invitation email for ${email} has no token in its acceptUrl`);
  }
  return token;
}
