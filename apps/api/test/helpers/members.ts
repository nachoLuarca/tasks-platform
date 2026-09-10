import type { Express } from 'express';
import request from 'supertest';

import { registerAndGetSession, type RegisteredSession } from './auth.js';
import { getInvitationToken } from './invitations.js';

/** Invites `user` into `organizationId` with `role`, registers them and accepts on their behalf. */
export async function addMember(
  app: Express,
  ownerAccessToken: string,
  organizationId: string,
  user: { email: string; password: string; name: string },
  role: 'ADMIN' | 'MEMBER' | 'VIEWER',
): Promise<RegisteredSession> {
  await request(app)
    .post(`/v1/organizations/${organizationId}/invitations`)
    .set('Authorization', `Bearer ${ownerAccessToken}`)
    .send({ email: user.email, role });
  const token = await getInvitationToken(user.email);

  const session = await registerAndGetSession(app, user);
  await request(app).post(`/v1/invitations/${token}/accept`).set('Authorization', `Bearer ${session.accessToken}`);

  return session;
}
