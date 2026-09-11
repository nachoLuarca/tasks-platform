import { Writable } from 'node:stream';

import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { redactTokenPaths } from '../../src/shared/http/redact-token-paths.js';
import { requestLogSerializers } from '../../src/shared/http/request-logger.middleware.js';

describe('redactTokenPaths', () => {
  it('masks the token segment of every route that carries one, and leaves other paths alone', () => {
    expect(redactTokenPaths('/v1/auth/reset-password/abc123')).toBe('/v1/auth/reset-password/[REDACTED]');
    expect(redactTokenPaths('/v1/auth/reset-password/abc123?x=1')).toBe('/v1/auth/reset-password/[REDACTED]?x=1');
    expect(redactTokenPaths('/v1/invitations/abc123')).toBe('/v1/invitations/[REDACTED]');
    expect(redactTokenPaths('/v1/invitations/abc123/accept')).toBe('/v1/invitations/[REDACTED]/accept');
    expect(redactTokenPaths('/v1/auth/forgot-password')).toBe('/v1/auth/forgot-password');
    expect(redactTokenPaths('/v1/organizations/abc123/projects')).toBe('/v1/organizations/abc123/projects');
  });
});

describe('access log', () => {
  it('writes the request line without the token -- neither in the url nor in the route params', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    // A real pino-http instance with the api's own serializers, writing to a
    // captured stream -- the app's logger is silent under test.
    const app = express();
    app.use(pinoHttp({ logger: pino(sink), serializers: requestLogSerializers }));
    app.get('/v1/auth/reset-password/:token', (_req, res) => {
      res.status(404).end();
    });

    const token = 'Zm9vYmFyLXRoaXMtaXMtYS1yZWFsLWxvb2tpbmctdG9rZW4';
    await request(app).get(`/v1/auth/reset-password/${token}`);

    const output = lines.join('');
    expect(output).toContain('/v1/auth/reset-password/[REDACTED]');
    expect(output).not.toContain(token);
  });
});
