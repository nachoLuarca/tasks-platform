import { compileErrors, validate } from '@readme/openapi-parser';
import { problemDetailsSchema, validationProblemDetailsSchema } from '@tasks-platform/contracts';
import type { Express } from 'express';
import type { OpenAPIV3_1 } from 'openapi-types';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { listRoutes, recordMountPaths } from '../helpers/express-routes.js';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

/** PHASE.md (Phase 5): every existing module must be covered. */
const MODULE_TAGS = [
  'auth',
  'users',
  'organizations',
  'members',
  'invitations',
  'projects',
  'tasks',
  'comments',
  'labels',
  'activity',
  'webhooks',
  'api-keys',
  'email-verification',
  'password-reset',
];

/** Routes outside the documented contract on purpose: health checks and the documentation itself. */
const UNDOCUMENTED_ROUTES = [
  'get /docs',
  'get /docs/swagger-initializer.js',
  'get /health/live',
  'get /health/ready',
  'get /openapi.json',
];

const PROBLEM_SCHEMA_REFS = ['#/components/schemas/ProblemDetails', '#/components/schemas/ValidationProblemDetails'];

let app: Express;

beforeAll(async () => {
  recordMountPaths();
  const { buildApp } = await import('../../src/app.js');
  app = buildApp();
});

async function fetchDocument(): Promise<OpenAPIV3_1.Document> {
  const response = await request(app).get('/openapi.json');
  return response.body as OpenAPIV3_1.Document;
}

function listOperations(document: OpenAPIV3_1.Document): { key: string; operation: OpenAPIV3_1.OperationObject }[] {
  return Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = pathItem?.[method];
      return operation ? [{ key: `${method} ${path}`, operation }] : [];
    }),
  );
}

describe('GET /openapi.json', () => {
  it('serves a valid OpenAPI 3.1 document without authentication', async () => {
    const response = await request(app).get('/openapi.json').set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body.openapi).toBe('3.1.0');

    const result = await validate(structuredClone(response.body as OpenAPIV3_1.Document));
    expect(result.valid, result.valid ? undefined : compileErrors(result)).toBe(true);
  });

  it('only documents routes under /v1, and no health checks', async () => {
    const paths = Object.keys((await fetchDocument()).paths ?? {});

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((path) => !path.startsWith('/v1/'))).toEqual([]);
    expect(paths.filter((path) => path.includes('health'))).toEqual([]);
  });

  it('covers every domain module with at least one operation', async () => {
    const document = await fetchDocument();
    const tagsInUse = new Set(listOperations(document).flatMap(({ operation }) => operation.tags ?? []));

    expect((document.tags ?? []).map((tag) => tag.name).sort()).toEqual([...MODULE_TAGS].sort());
    expect([...tagsInUse].sort()).toEqual([...MODULE_TAGS].sort());
  });

  it('documents every route the Express router registers under /v1, and nothing it does not', async () => {
    const document = await fetchDocument();
    const registered = listRoutes(app).map(({ method, path }) => `${method} ${path.replace(/:([A-Za-z]+)/g, '{$1}')}`);

    const registeredUnderV1 = registered.filter((route) => route.split(' ')[1]?.startsWith('/v1/'));
    const registeredElsewhere = registered.filter((route) => !registeredUnderV1.includes(route));

    // A new endpoint without its *.openapi.ts entry shows up here as missing
    // from the document; a documented endpoint that no longer exists, as extra.
    expect([...registeredUnderV1].sort()).toEqual(listOperations(document).map(({ key }) => key).sort());
    expect([...registeredElsewhere].sort()).toEqual(UNDOCUMENTED_ROUTES);
  });

  it('gives every operation a unique operationId, a summary and at least one success response', async () => {
    const operations = listOperations(await fetchDocument());
    const operationIds = operations.map(({ operation }) => operation.operationId);

    expect(new Set(operationIds).size).toBe(operations.length);
    for (const { key, operation } of operations) {
      expect(operation.summary, key).toBeTruthy();
      expect(Object.keys(operation.responses ?? {}).some((status) => status.startsWith('2')), key).toBe(true);
    }
  });

  it('describes every error response with the Problem Details schemas from contracts', async () => {
    for (const { key, operation } of listOperations(await fetchDocument())) {
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (Number(status) < 400) {
          continue;
        }
        const media = (response as OpenAPIV3_1.ResponseObject).content?.['application/problem+json'];
        const ref = (media?.schema as OpenAPIV3_1.ReferenceObject | undefined)?.$ref;
        expect(PROBLEM_SCHEMA_REFS, `${key} ${status}`).toContain(ref);
      }
    }
  });

  it('matches the Problem Details the error middleware actually sends, field for field', async () => {
    const notFound = await request(app).get('/v1/no-such-route');
    expect(notFound.status).toBe(404);
    expect(notFound.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(problemDetailsSchema.strict().parse(notFound.body)).toEqual(notFound.body);

    const invalid = await request(app).post('/v1/auth/login').send({});
    expect(invalid.status).toBe(400);
    expect(validationProblemDetailsSchema.strict().parse(invalid.body)).toEqual(invalid.body);
    expect(invalid.body.errors.fieldErrors.email).toBeDefined();
  });
});

describe('GET /docs', () => {
  it('serves Swagger UI with a 200, without authentication or a redirect', async () => {
    const response = await request(app).get('/docs');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.text).toContain('id="swagger-ui"');
  });

  it('serves every asset the page references, and points Swagger UI at /openapi.json', async () => {
    const page = await request(app).get('/docs');
    const assetUrls = [...page.text.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((url): url is string => Boolean(url));

    expect(assetUrls.length).toBeGreaterThan(0);
    for (const url of assetUrls) {
      const asset = await request(app).get(url);
      expect(asset.status, url).toBe(200);
    }

    const initializer = await request(app).get('/docs/swagger-initializer.js');
    expect(initializer.text).toContain("url: '/openapi.json'");
  });
});
