import type { Express } from 'express';
import request from 'supertest';

export interface RegisteredSession {
  userId: string;
  email: string;
  accessToken: string;
  organizationId: string;
}

/** Registers a user (which also creates their personal, OWNER organization) and returns both. */
export async function registerAndGetSession(
  app: Express,
  user: { email: string; password: string; name: string },
): Promise<RegisteredSession> {
  const registerResponse = await request(app).post('/v1/auth/register').send(user);
  const accessToken = registerResponse.body.accessToken as string;
  const userId = registerResponse.body.user.id as string;

  const organizationsResponse = await request(app)
    .get('/v1/organizations')
    .set('Authorization', `Bearer ${accessToken}`);
  const organizationId = organizationsResponse.body[0].id as string;

  return { userId, email: user.email.toLowerCase(), accessToken, organizationId };
}
