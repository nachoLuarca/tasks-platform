import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/db/index.js';
import { registerAndGetSession, type RegisteredSession } from '../helpers/auth.js';
import { resetDatabase } from '../helpers/db.js';
import { addMember } from '../helpers/members.js';

const app = buildApp();

const owner = { email: 'ada.lovelace@example.com', password: 'correct-horse-battery', name: 'Ada Lovelace' };
const admin = { email: 'grace.hopper@example.com', password: 'correct-horse-battery', name: 'Grace Hopper' };
const viewer = { email: 'edsger.dijkstra@example.com', password: 'correct-horse-battery', name: 'Edsger Dijkstra' };
const outsider = { email: 'donald.knuth@example.com', password: 'correct-horse-battery', name: 'Donald Knuth' };

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface Setup {
  owner: RegisteredSession;
  admin: RegisteredSession;
  viewer: RegisteredSession;
  organizationId: string;
  webhookId: string;
  base: string;
}

async function setup(): Promise<Setup> {
  const ownerSession = await registerAndGetSession(app, owner);
  const { organizationId } = ownerSession;
  const adminSession = await addMember(app, ownerSession.accessToken, organizationId, admin, 'ADMIN');
  const viewerSession = await addMember(app, ownerSession.accessToken, organizationId, viewer, 'VIEWER');
  const base = `/v1/organizations/${organizationId}/webhooks`;
  const created = await request(app)
    .post(base)
    .set('Authorization', `Bearer ${ownerSession.accessToken}`)
    .send({ url: 'https://example.com/hooks', eventTypes: ['TASK_CREATED'] });
  return {
    owner: ownerSession,
    admin: adminSession,
    viewer: viewerSession,
    organizationId,
    webhookId: created.body.id as string,
    base,
  };
}

describe('webhooks service: update / remove / deliveries', () => {
  it('an ADMIN can update url, event types and enabled flag', async () => {
    const s = await setup();
    const response = await request(app)
      .patch(`${s.base}/${s.webhookId}`)
      .set('Authorization', `Bearer ${s.admin.accessToken}`)
      .send({ url: 'https://example.com/other', eventTypes: ['STATUS_CHANGED'], enabled: false });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe('https://example.com/other');
    expect(response.body.eventTypes).toEqual(['STATUS_CHANGED']);
    expect(response.body.enabled).toBe(false);
    expect(response.body.secret).toBeUndefined();
  });

  it('removing an endpoint deletes it, and a second delete is 404', async () => {
    const s = await setup();
    const first = await request(app).delete(`${s.base}/${s.webhookId}`).set('Authorization', `Bearer ${s.owner.accessToken}`);
    expect(first.status).toBe(204);
    expect(await prisma.webhookEndpoint.count({ where: { id: s.webhookId } })).toBe(0);

    const second = await request(app).delete(`${s.base}/${s.webhookId}`).set('Authorization', `Bearer ${s.owner.accessToken}`);
    expect(second.status).toBe(404);
  });

  it('lists deliveries as a page, and rejects an invalid cursor/limit', async () => {
    const s = await setup();
    const empty = await request(app)
      .get(`${s.base}/${s.webhookId}/deliveries`)
      .set('Authorization', `Bearer ${s.owner.accessToken}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);

    const event = await prisma.outboxEvent.create({
      data: { organizationId: s.organizationId, type: 'TASK_CREATED', payload: {}, dispatchedAt: new Date() },
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await prisma.webhookDelivery.create({
        data: { endpointId: s.webhookId, outboxEventId: event.id, attempt, statusCode: 200, durationMs: 5 },
      });
    }

    const firstPage = await request(app)
      .get(`${s.base}/${s.webhookId}/deliveries?limit=2`)
      .set('Authorization', `Bearer ${s.owner.accessToken}`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await request(app)
      .get(`${s.base}/${s.webhookId}/deliveries?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor as string)}`)
      .set('Authorization', `Bearer ${s.owner.accessToken}`);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data).toHaveLength(1);

    const badLimit = await request(app)
      .get(`${s.base}/${s.webhookId}/deliveries?limit=0`)
      .set('Authorization', `Bearer ${s.owner.accessToken}`);
    expect(badLimit.status).toBe(400);
  });
});

describe('webhooks: errors and permissions', () => {
  it.each([
    ['patch', '' as const],
    ['delete', '' as const],
    ['post', '/rotate-secret' as const],
    ['post', '/test' as const],
    ['get', '/deliveries' as const],
  ])('a VIEWER gets 403 on %s %s', async (method, suffix) => {
    const s = await setup();
    const response = await request(app)[method as 'get'](`${s.base}/${s.webhookId}${suffix}`)
      .set('Authorization', `Bearer ${s.viewer.accessToken}`)
      .send(method === 'patch' ? { enabled: false } : undefined);
    expect(response.status).toBe(403);
  });

  it('a VIEWER cannot list webhooks either', async () => {
    const s = await setup();
    const response = await request(app).get(s.base).set('Authorization', `Bearer ${s.viewer.accessToken}`);
    expect(response.status).toBe(403);
  });

  it.each([
    ['patch', '' as const],
    ['delete', '' as const],
    ['post', '/rotate-secret' as const],
    ['post', '/test' as const],
    ['get', '/deliveries' as const],
  ])('returns 404 on %s %s for a nonexistent webhook', async (method, suffix) => {
    const s = await setup();
    const response = await request(app)[method as 'get'](`${s.base}/${randomUUID()}${suffix}`)
      .set('Authorization', `Bearer ${s.owner.accessToken}`)
      .send(method === 'patch' ? { enabled: false } : undefined);
    expect(response.status).toBe(404);
  });

  it("returns 404 for a webhook that belongs to another organization", async () => {
    const s = await setup();
    const other = await registerAndGetSession(app, outsider);
    const response = await request(app)
      .delete(`/v1/organizations/${other.organizationId}/webhooks/${s.webhookId}`)
      .set('Authorization', `Bearer ${other.accessToken}`);
    expect(response.status).toBe(404);
    expect(await prisma.webhookEndpoint.count({ where: { id: s.webhookId } })).toBe(1);
  });

  it('rejects invalid create bodies with 400', async () => {
    const s = await setup();
    const bodies = [
      { url: 'not-a-url', eventTypes: ['TASK_CREATED'] },
      { url: 'https://example.com/h', eventTypes: [] },
      { url: 'https://example.com/h', eventTypes: ['NOT_AN_EVENT'] },
      { eventTypes: ['TASK_CREATED'] },
    ];
    for (const body of bodies) {
      const response = await request(app).post(s.base).set('Authorization', `Bearer ${s.owner.accessToken}`).send(body);
      expect(response.status).toBe(400);
    }
  });

  it('rejects invalid update bodies with 400', async () => {
    const s = await setup();
    for (const body of [{}, { url: 'nope' }, { eventTypes: [] }, { enabled: 'yes' }]) {
      const response = await request(app)
        .patch(`${s.base}/${s.webhookId}`)
        .set('Authorization', `Bearer ${s.owner.accessToken}`)
        .send(body);
      expect(response.status).toBe(400);
    }
  });

  it('requires authentication', async () => {
    const s = await setup();
    const response = await request(app).get(s.base);
    expect(response.status).toBe(401);
  });
});
