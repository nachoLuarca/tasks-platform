import { compileErrors, validate } from '@readme/openapi-parser';
import type { OpenAPIV3_1 } from 'openapi-types';

import { buildOpenApiDocument } from '../src/openapi-document.js';

/**
 * CI gate (see .github/workflows/ci.yml): builds the OpenAPI document exactly
 * as the API does at startup, and fails if building it throws or the result
 * isn't valid against the official OpenAPI 3.1 schema. Needs no env, database
 * or network. Whether every Express route is documented is checked by
 * test/integration/openapi.test.ts, which needs the app itself.
 */
const document = buildOpenApiDocument();
const result = await validate(structuredClone(document) as OpenAPIV3_1.Document);

for (const warning of result.warnings) {
  console.warn(`warning: ${warning.message}`);
}

if (!result.valid) {
  console.error(compileErrors(result));
  process.exit(1);
}

const paths = Object.values(document.paths ?? {});
const operations = paths.reduce((count, pathItem) => count + Object.keys(pathItem).length, 0);
console.log(`OpenAPI ${document.openapi} document is valid: ${paths.length} paths, ${operations} operations.`);
