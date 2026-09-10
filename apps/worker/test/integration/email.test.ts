import { prisma } from '@tasks-platform/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { sendInvitationEmail } from '../../src/services/email.service.js';
import { clearMailpit, findMailpitMessageTo } from '../helpers/mailpit.js';

beforeEach(async () => {
  await clearMailpit();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('invitation email', () => {
  it('reaches Mailpit with the correct accept link, in both text and HTML', async () => {
    const to = `invitee-${Date.now()}@example.com`;
    const acceptUrl = 'http://localhost:3000/v1/invitations/some-real-looking-token';

    await sendInvitationEmail({ to, organizationName: 'Acme Corp', invitedByName: 'Ada Lovelace', role: 'MEMBER', acceptUrl });

    const message = await findMailpitMessageTo(to);

    expect(message.Subject).toContain('Acme Corp');
    expect(message.Text).toContain(acceptUrl);
    expect(message.Text).toContain('Ada Lovelace');
    expect(message.HTML).toContain(acceptUrl);
    expect(message.HTML).toContain('Acme Corp');
  });
});
