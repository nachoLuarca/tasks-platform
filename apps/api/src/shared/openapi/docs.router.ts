import { createRequire } from 'node:module';
import path from 'node:path';

import express, { Router } from 'express';

const require = createRequire(import.meta.url);
const SWAGGER_UI_ASSETS_DIR = path.dirname(require.resolve('swagger-ui-dist/package.json'));

export const OPENAPI_JSON_PATH = '/openapi.json';
export const DOCS_PATH = '/docs';

// Absolute asset paths, so /docs answers 200 directly instead of redirecting
// to /docs/ for relative URLs to resolve. The initializer is a separate file,
// not an inline <script>: helmet's Content-Security-Policy blocks inline
// scripts, and this page gets no exception to it.
const DOCS_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>tasks-platform API</title>
    <link rel="stylesheet" href="${DOCS_PATH}/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${DOCS_PATH}/assets/swagger-ui-bundle.js"></script>
    <script src="${DOCS_PATH}/swagger-initializer.js"></script>
  </body>
</html>
`;

const SWAGGER_INITIALIZER_JS = `window.ui = SwaggerUIBundle({
  url: '${OPENAPI_JSON_PATH}',
  dom_id: '#swagger-ui',
  deepLinking: true,
  validatorUrl: null,
});
`;

/**
 * Public, outside `/v1` and outside requireAuth (PHASE.md decision 4). The
 * document is built once by the caller and served as is.
 */
export function createDocsRouter(document: object): Router {
  const router = Router();

  router.get(OPENAPI_JSON_PATH, (_req, res) => {
    res.status(200).json(document);
  });

  router.get(DOCS_PATH, (_req, res) => {
    res.status(200).type('html').send(DOCS_HTML);
  });

  router.get(`${DOCS_PATH}/swagger-initializer.js`, (_req, res) => {
    res.status(200).type('application/javascript').send(SWAGGER_INITIALIZER_JS);
  });

  router.use(`${DOCS_PATH}/assets`, express.static(SWAGGER_UI_ASSETS_DIR, { index: false }));

  return router;
}
