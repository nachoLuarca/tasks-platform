import { randomUUID } from 'node:crypto';

import type { Job } from 'bullmq';
import {
  accountTokensService,
  buildAccountTokenLink,
  emailQueue,
  prisma,
  sharedConfig,
  type EmailJobData,
} from '@tasks-platform/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { processEmail } from '../../src/processors/email.processor.js';
import { handlePasswordResetRequest } from '../../src/services/password-reset.service.js';
import { createTestUser } from '../helpers/fixtures.js';
import { clearMailpit, findMailpitMessageTo } from '../helpers/mailpit.js';

beforeEach(async () => {
  await clearMailpit();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function queuedEmailJobsFor(email: string): Promise<Job<EmailJobData>[]> {
  return emailQueue()
    .getJobs(['waiting', 'delayed', 'prioritized', 'active', 'completed', 'failed'], 0, 1000)
    .then((jobs) => jobs.filter((job) => job.data.to === email));
}

/**
 * Sends the email job the service just queued, through the real processor.
 * If the docker stack's worker is running it may have claimed the job first
 * -- then removing it fails (locked) or finds nothing, and that worker sends
 * the very same email to the same Mailpit. Either way exactly one real email
 * with this job's link lands in the inbox.
 */
async function deliverQueuedEmail(email: string): Promise<void> {
  for (const job of await queuedEmailJobsFor(email)) {
    try {
      await job.remove();
    } catch {
      continue;
    }
    await processEmail(job);
  }
}

function extractLink(text: string, path: string): string {
  const match = text.match(new RegExp(`https?://\\S+${path}#token=\\S+`));
  if (!match) {
    throw new Error(`No ${path} link in email:\n${text}`);
  }
  return match[0];
}

function tokenFromLink(link: string): string {
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
  if (!token) {
    throw new Error(`Link has no #token fragment: ${link}`);
  }
  return token;
}

describe('verification email', () => {
  it('reaches Mailpit with a working link: the token in its fragment is valid, and consumable exactly once', async () => {
    const user = await createTestUser();
    const { token } = await accountTokensService.issue('email-verification', user.id);
    // The exact job the api queues at registration (email-verification.service.ts).
    await processEmail({
      data: {
        template: 'email-verification',
        to: user.email,
        name: user.name,
        verifyUrl: buildAccountTokenLink('email-verification', token),
      },
    } as Job<EmailJobData>);

    const message = await findMailpitMessageTo(user.email);
    const link = extractLink(message.Text, '/verify-email');

    expect(link.startsWith(new URL('/verify-email#token=', sharedConfig.webAppUrl).toString())).toBe(true);
    expect(message.HTML).toContain(link);
    expect(message.Text).toContain('24 horas');

    const linkToken = tokenFromLink(link);
    expect(await accountTokensService.findValid('email-verification', linkToken)).toMatchObject({ userId: user.id });
    expect(await accountTokensService.consume('email-verification', linkToken)).toEqual({ userId: user.id });
    expect(await accountTokensService.consume('email-verification', linkToken)).toBeNull();
  });
});

describe('password reset request', () => {
  it('for an existing account: issues one 1-hour token and emails a working reset link', async () => {
    const user = await createTestUser();

    expect(await handlePasswordResetRequest(user.email)).toBe('email-queued');
    await deliverQueuedEmail(user.email);

    const message = await findMailpitMessageTo(user.email);
    expect(message.Subject).toContain('contraseña');
    expect(message.Text).toContain('1 hora');
    expect(message.Text).toContain('se cierran todas las sesiones');

    const link = extractLink(message.Text, '/reset-password');
    expect(message.HTML).toContain(link);
    const valid = await accountTokensService.findValid('password-reset', tokenFromLink(link));
    expect(valid?.userId).toBe(user.id);
    expect(valid!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);

    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it('for an unknown address: no token, no email job, and it completes quietly', async () => {
    const email = `nobody-${randomUUID()}@example.com`;

    expect(await handlePasswordResetRequest(email)).toBe('no-account');
    expect(await queuedEmailJobsFor(email)).toHaveLength(0);
  });

  it('for a soft-deleted account: treated exactly like an unknown address', async () => {
    const user = await createTestUser();
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    expect(await handlePasswordResetRequest(user.email)).toBe('no-account');
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('drops requests past the per-account hourly cap, silently', async () => {
    const user = await createTestUser();

    const outcomes = [];
    for (let i = 0; i < 4; i += 1) {
      outcomes.push(await handlePasswordResetRequest(user.email));
    }

    expect(outcomes).toEqual(['email-queued', 'email-queued', 'email-queued', 'limit-reached']);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(3);

    for (const job of await queuedEmailJobsFor(user.email)) {
      await job.remove().catch(() => undefined);
    }
  });
});

describe('account token consumption', () => {
  it('is atomic: two concurrent consumers of the same token never both win', async () => {
    const user = await createTestUser();
    const { token } = await accountTokensService.issue('password-reset', user.id);

    const results = await Promise.all([
      accountTokensService.consume('password-reset', token),
      accountTokensService.consume('password-reset', token),
      accountTokensService.consume('password-reset', token),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });
});
