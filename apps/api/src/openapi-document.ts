import { readFileSync } from 'node:fs';

import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { registerActivityPaths } from './modules/activity/activity.openapi.js';
import { registerApiKeysPaths } from './modules/api-keys/api-keys.openapi.js';
import { API_KEY_PREFIX } from './modules/api-keys/api-keys.types.js';
import { registerAuthPaths } from './modules/auth/auth.openapi.js';
import { REFRESH_TOKEN_COOKIE } from './modules/auth/auth.types.js';
import { registerCommentsPaths } from './modules/comments/comments.openapi.js';
import { registerEmailVerificationPaths } from './modules/email-verification/email-verification.openapi.js';
import { registerInvitationsPaths } from './modules/invitations/invitations.openapi.js';
import { registerLabelsPaths } from './modules/labels/labels.openapi.js';
import { registerMembersPaths } from './modules/members/members.openapi.js';
import { registerOrganizationsPaths } from './modules/organizations/organizations.openapi.js';
import { registerPasswordResetPaths } from './modules/password-reset/password-reset.openapi.js';
import { registerProjectsPaths } from './modules/projects/projects.openapi.js';
import { registerTasksPaths } from './modules/tasks/tasks.openapi.js';
import { registerUsersPaths } from './modules/users/users.openapi.js';
import { registerWebhooksPaths } from './modules/webhooks/webhooks.openapi.js';
import { API_TAGS, BEARER_AUTH, REFRESH_TOKEN_COOKIE_AUTH } from './shared/openapi/index.js';

export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

const REGISTER_MODULE_PATHS: ReadonlyArray<(registry: OpenAPIRegistry) => void> = [
  registerAuthPaths,
  registerEmailVerificationPaths,
  registerPasswordResetPaths,
  registerUsersPaths,
  registerOrganizationsPaths,
  registerMembersPaths,
  registerInvitationsPaths,
  registerProjectsPaths,
  registerTasksPaths,
  registerCommentsPaths,
  registerLabelsPaths,
  registerActivityPaths,
  registerWebhooksPaths,
  registerApiKeysPaths,
];

/** The version release-please writes into apps/api/package.json -- the repository's, not the HTTP contract's (that one is /v1). */
function readApiVersion(): string {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return packageJson.version;
}

let cachedDocument: OpenApiDocument | undefined;

/**
 * The OpenAPI 3.1 document, generated from the same packages/contracts
 * schemas that validate every request, plus each module's `*.openapi.ts`
 * route metadata -- never written by hand, see
 * docs/adr/0012-generated-openapi.md. Built once per process.
 *
 * Imports no config, logger or database client, so scripts/check-openapi.ts
 * can build it in CI with no env at all.
 */
export function buildOpenApiDocument(): OpenApiDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const registry = new OpenAPIRegistry();

  registry.registerComponent('securitySchemes', BEARER_AUTH, {
    type: 'http',
    scheme: 'bearer',
    description: `Un access token JWT (lo devuelven \`POST /v1/auth/register\`, \`/login\` y \`/refresh\`; vence a los 15 minutos) o una API key de organizacion (empieza con \`${API_KEY_PREFIX}\`). Las dos van en \`Authorization: Bearer <credencial>\`.`,
  });
  registry.registerComponent('securitySchemes', REFRESH_TOKEN_COOKIE_AUTH, {
    type: 'apiKey',
    in: 'cookie',
    name: REFRESH_TOKEN_COOKIE,
    description: 'Refresh token opaco, en una cookie HttpOnly que la API fija al registrarse, iniciar sesion o renovar.',
  });

  for (const registerPaths of REGISTER_MODULE_PATHS) {
    registerPaths(registry);
  }

  cachedDocument = new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'tasks-platform API',
      version: readApiVersion(),
      description:
        'API multi-tenant de gestion de tareas. Todas las rutas llevan el prefijo `/v1`, que versiona el contrato HTTP. Los errores responden en formato RFC 9457 (`application/problem+json`).\n\nEste documento se genera al arrancar desde los esquemas Zod de `packages/contracts`, los mismos que validan cada peticion.',
    },
    tags: API_TAGS.map((tag) => ({ ...tag })),
  });

  return cachedDocument;
}
