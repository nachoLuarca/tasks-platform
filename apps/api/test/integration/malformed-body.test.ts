import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';

/**
 * A body that isn't parseable JSON is rejected by `express.json()` before any
 * route handler runs, with a bare SyntaxError rather than one of our
 * AppErrors. It used to fall through to the catch-all in
 * shared/errors/problem-details.ts and come back as a 500, telling the caller
 * the server was broken when the request was.
 */
describe('malformed JSON body', () => {
  it('answers 400 Problem Details, not 500', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "someone@example.com", "password":');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'https://tasks-platform.dev/errors/validation',
      title: 'Validation Error',
      status: 400,
    });
    // The parser's own message can name a byte offset from the raw body; it
    // must not be echoed back.
    expect(JSON.stringify(response.body)).not.toContain('JSON.parse');
  });

  it('still answers 400 when the body is not JSON at all', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('not json');

    expect(response.status).toBe(400);
    expect(response.body.status).toBe(400);
  });
});
