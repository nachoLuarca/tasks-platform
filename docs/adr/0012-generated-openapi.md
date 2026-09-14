# 0012 — La especificacion OpenAPI se genera desde los esquemas Zod

## Contexto

Hasta la Fase 4.5, quien integraba con la API tenia como referencia la tabla
de endpoints del README y los recorridos con `curl`. La Fase 5 publica una
especificacion OpenAPI 3.1 y la sirve con Swagger UI.

Habia dos formas de tener esa especificacion:

1. Escribir un `openapi.yaml` a mano y mantenerlo.
2. Generarla desde los esquemas Zod de `packages/contracts`, que ya son la
   fuente de verdad de cada payload: `validateBody` y `validateQuery` validan
   cada peticion con ellos, y los mappers tipan cada respuesta con sus tipos.

PHASE.md la da como decision cerrada: se genera. Este ADR deja escrito por que,
y como esta armado para que no se desincronice.

## El riesgo concreto: un contrato que cambia sin que el documento se entere

Un ejemplo real del historial. En la Fase 4 los proyectos y las tareas tenian
un solo autor posible, un usuario, y `createdById` era un UUID siempre
presente. En la Fase 4.5 las API keys pasaron a poder escribir en su propio
nombre: `createdById` paso a ser nullable y aparecio `createdByApiKeyId`
(exactamente uno de los dos tiene valor). Los comentarios sumaron
`authorApiKeyId` y `authorApiKey`, y la bitacora paso a tener dos formas de
actor.

Con un YAML escrito a mano en la Fase 4, ese cambio de la Fase 4.5 compilaba,
pasaba los 210 tests y llegaba a `main` con el documento todavia diciendo que
`createdById` es obligatorio. Nada en el repositorio mira ese archivo: ni el
compilador ni los tests. El primer integrador que generara un cliente tipado
desde la especificacion recibiria `null` en un campo que su codigo trata como
obligatorio, y su integracion fallaria justo con las tareas creadas por una API
key, es decir, con la funcionalidad nueva.

Generando desde Zod, ese cambio no se puede olvidar: el esquema que se edita
para que la API acepte y devuelva la forma nueva es el mismo objeto que produce
el documento.

## Decision

### Que se genera y de donde

`apps/api/src/openapi-document.ts` arma el documento una vez por proceso, al
construir la app, con `@asteasolutions/zod-to-openapi`. Se sirve en
`GET /openapi.json`.

- **Payloads (cuerpos, query strings y respuestas):** se importan de
  `packages/contracts`. Son los mismos objetos que usan los middlewares de
  validacion. Ningun campo se describe dos veces.
- **Metadatos por ruta** (resumen, descripcion, permiso, codigos de respuesta):
  cada modulo los declara en `<dominio>.openapi.ts`, al lado de su
  `<dominio>.routes.ts`, con `registerOperation`. Los paths se escriben con la
  misma sintaxis de Express (`/v1/organizations/:organizationId`) y se
  convierten solos.
- **Codigos de error inferidos:** `400` si la ruta valida un cuerpo o query,
  `401` si no es publica, `403` si declara un permiso o es solo para usuarios,
  y `404` si tiene parametros de path. Cada ruta agrega los suyos (`409`,
  `422`, `429`) con una descripcion concreta.
- **Parametros de path:** se describen una vez en `PATH_PARAMETERS`. Un
  `:param` nuevo sin descripcion hace fallar la generacion.

### Errores: la forma RFC 9457 real, no una aparte

El esquema de Problem Details vive en `packages/contracts`
(`problem-details.schema.ts`). La funcion que convierte un error en la
respuesta (`toProblemDetails`, en `shared/errors/problem-details.ts`) devuelve
el tipo inferido de ese esquema, asi que el middleware no puede enviar un campo
que el documento no declare sin que falle el typecheck. Los ejemplos de cada
error del documento se generan pasando instancias reales de las clases de error
(`NotFoundError`, `ValidationError`, ...) por esa misma funcion.

Un test pide un `404` y un `400` reales a la API y los valida en modo estricto
contra esos esquemas.

### Swagger UI

`/docs` sirve Swagger UI desde `swagger-ui-dist`, con una pagina propia de
pocas lineas que apunta a `/openapi.json`. No se uso `swagger-ui-express`
porque arma la pagina con rutas relativas y redirige `/docs` a `/docs/`: un
`curl` a `/docs` recibiria `301`, no `200`. La configuracion inicial va en un
archivo aparte y no en un `<script>` inline, para no abrirle una excepcion a la
Content-Security-Policy de helmet. Las dos rutas son publicas, estan fuera de
`/v1` y no pasan por `requireAuth`.

### Como se controla lo que sigue siendo manual

Los metadatos por ruta si se escriben a mano, asi que se verifican:

- **Una ruta sin documentar** (o documentada y ya inexistente):
  `test/integration/openapi.test.ts` recorre el arbol real de routers de
  Express, incluidos los sub-routers montados, y exige que las rutas bajo
  `/v1` coincidan exactamente con las operaciones del documento. Fuera de
  `/v1` solo se aceptan las de health y las de la propia documentacion.
- **Un documento invalido:** el paso `Validate OpenAPI document` de CI
  (`pnpm --filter @tasks-platform/api run openapi:check`) genera el documento
  sin env ni servicios y lo valida contra el esquema oficial de OpenAPI 3.1
  con `@readme/openapi-parser`. El mismo chequeo corre en la suite de tests.

## Alternativas consideradas

- **YAML a mano con un test de contrato.** Detecta rutas faltantes, pero no un
  campo que cambio de tipo o paso a ser nullable, que es justo el caso de
  arriba. Ademas duplica cada esquema.
- **Comentarios JSDoc (`swagger-jsdoc`).** Queda cerca del codigo, pero sigue
  siendo texto libre que nadie verifica contra los esquemas reales.
- **Generar un `openapi.json` en build y commitearlo.** Obliga a regenerarlo y
  a un chequeo en CI de "archivo desactualizado". Generarlo al arrancar no deja
  ningun artefacto que se pueda quedar viejo.
- **`zod-to-openapi` 8 o posterior.** Requiere Zod 4; los contratos usan Zod 3.
  Se usa la 7.3.4, la ultima serie compatible.

## Consecuencias

- Dependencias nuevas en `apps/api`: `@asteasolutions/zod-to-openapi` y
  `swagger-ui-dist` en runtime (el documento se genera al arrancar);
  `@readme/openapi-parser` y `openapi-types` solo para tests y CI. El script
  de instalacion de `@scarf/scarf` (telemetria que trae `swagger-ui-dist`)
  queda denegado en `pnpm-workspace.yaml`.
- Pasar a Zod 4 obligara a subir `zod-to-openapi` de version mayor en el mismo
  cambio.
- `info.version` es la version de `apps/api/package.json`, que actualiza
  release-please. Versiona el repositorio, no el contrato HTTP: ese lo versiona
  el prefijo `/v1` (decision 5 de la Fase 5).
- **Limite:** el documento describe lo que dicen los esquemas de contracts, no
  lo que un controller devuelve de verdad. Si un controller armara a mano una
  forma distinta del contrato, el documento no lo detectaria. Hoy los mappers
  tipan las respuestas con los tipos de contracts. La unica excepcion
  encontrada al generar el documento es `PATCH .../members/:userId`, que
  responde solo `userId`, `role` y `joinedAt`: esta documentada asi, con un
  `pick` de `memberResponseSchema`, en vez de prometer el miembro completo.
