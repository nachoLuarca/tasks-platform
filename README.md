# tasks-platform

[![CI](https://github.com/nachoLuarca/tasks-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/nachoLuarca/tasks-platform/actions/workflows/ci.yml)

API multi-tenant de gestion de tareas: organizaciones con usuarios, roles y
permisos granulares, proyectos y tareas, y una superficie de integracion via
API keys y webhooks salientes. El protagonista del proyecto es la API; el
cliente frontend incluido (`apps/web`, en fases posteriores) es solo un
cliente de demostracion.

La Fase 0 (`v0.1.0`) dejo el esqueleto del proyecto funcionando de punta a
punta, sin logica de dominio. La Fase 1 (`v0.2.0`) agrego usuarios,
organizaciones y el ciclo completo de autenticacion: registro, login,
renovacion de sesion con rotacion de refresh token, cierre de sesion y
gestion basica de perfil. La Fase 2 (`v0.3.0`) agrego roles con permisos
granulares, gestion de miembros e invitaciones. La Fase 3 (`v0.4.0`) agrego
proyectos y tareas: numeracion por proyecto, bloqueo optimista, y listados
paginados con filtros. La Fase 3.5 (`v0.5.0`) cerro el dominio con
comentarios en las tareas, etiquetas reutilizables por organizacion, y una
bitacora de actividad de solo lectura. La Fase 4 (en curso) agrega la
superficie de integracion: cada cambio de la bitacora se publica como un
evento saliente firmado hacia los webhooks suscriptos, con reintentos y
desactivacion automatica tras fallos repetidos; API keys de organizacion con
scopes propios; y un proceso worker aparte que despacha ambos, ademas del
envio real del correo de invitacion. El detalle de alcance de la fase actual
esta en [`PHASE.md`](./PHASE.md); las decisiones de arquitectura y las
convenciones del proyecto estan en [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Requisitos previos

- [Docker](https://www.docker.com/) y Docker Compose (v2)
- Node.js 24 (ver [`.nvmrc`](./.nvmrc)) y [pnpm](https://pnpm.io/), solo si se
  quiere correr algo fuera de Docker (lint, typecheck, tests locales)

## Como levantarlo

```bash
git clone <url-del-repositorio> && cd tasks-platform
cp .env.example .env
docker compose up
```

Esto levanta cinco servicios: la API, el worker (despacha webhooks y correo),
PostgreSQL, Redis y Mailpit (servidor de correo local para desarrollo). La
API queda escuchando en `http://localhost:3000` y el worker en
`http://localhost:3100` (solo expone `/health`), ambos con recarga en
caliente sobre el codigo montado desde el host.

Verificacion rapida:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
curl http://localhost:3100/health/live
curl http://localhost:3100/health/ready
```

`/health/ready` responde 200 solo si la base de datos y Redis estan
alcanzables; si alguna falla, responde 503 indicando cual. El worker expone
los mismos dos caminos, sin nada mas: PHASE.md pide que no tenga superficie
HTTP mas alla de su propia salud.

### Migraciones de base de datos

La primera vez (y cada vez que cambie el esquema de Prisma), aplicar las
migraciones:

```bash
pnpm db:migrate
```

## Endpoints disponibles

Todas las rutas de la API llevan el prefijo `/v1`.

| Metodo y ruta                | Requiere auth | Que hace                                                    |
| ---------------------------- | :-----------: | ----------------------------------------------------------- |
| `POST /v1/auth/register`     |       -       | Crea usuario, organizacion personal y sesion                |
| `POST /v1/auth/login`        |       -       | Inicia sesion                                               |
| `POST /v1/auth/refresh`      |       -       | Renueva el access token, rota el refresh token              |
| `POST /v1/auth/logout`       |       -       | Cierra la sesion actual                                     |
| `POST /v1/auth/logout-all`   |       ✓       | Cierra todas las sesiones del usuario                       |
| `GET /v1/auth/me`            |       ✓       | Perfil del usuario autenticado, con `emailVerifiedAt` (`null` si no verifico) |
| `POST /v1/auth/verify-email` |       -       | Consume el token de verificacion y marca el correo como verificado |
| `POST /v1/auth/resend-verification` | ✓ | Reenvia el correo de verificacion (maximo 3 por hora por cuenta, luego 429) |
| `POST /v1/auth/forgot-password` | - | Pide un enlace de recuperacion; responde siempre `202` igual, exista o no la cuenta |
| `GET /v1/auth/reset-password/:token` | - | Indica si un token de recuperacion sigue siendo valido, sin consumirlo |
| `POST /v1/auth/reset-password` | - | Consume el token, cambia la contraseña y cierra **todas** las sesiones |
| `PATCH /v1/users/me`         |       ✓       | Actualiza el nombre                                         |
| `POST /v1/users/me/password` |       ✓       | Cambia la contraseña; revoca las demas sesiones             |
| `POST /v1/organizations`     |       ✓       | Crea una organizacion adicional                             |
| `GET /v1/organizations`      |       ✓       | Lista las organizaciones del usuario                        |
| `GET /v1/organizations/:organizationId` | ✓ | Una organizacion, solo si el usuario es miembro (404 si no) |
| `PATCH /v1/organizations/:organizationId` | ✓ | Edita la organizacion (`organization:update`) |
| `DELETE /v1/organizations/:organizationId` | ✓ | Elimina la organizacion (solo `OWNER`) |
| `POST /v1/organizations/:organizationId/transfer-ownership` | ✓ | Transfiere la propiedad (solo `OWNER`) |
| `GET /v1/organizations/:organizationId/members` | ✓ | Lista los miembros |
| `PATCH /v1/organizations/:organizationId/members/:userId` | ✓ | Cambia el rol de un miembro (`member:update-role`) |
| `DELETE /v1/organizations/:organizationId/members/:userId` | ✓ | Expulsa a un miembro (`member:remove`) |
| `DELETE /v1/organizations/:organizationId/members/me` | ✓ | Abandona la organizacion |
| `POST /v1/organizations/:organizationId/invitations` | ✓ | Crea una invitacion (`invitation:create`) |
| `GET /v1/organizations/:organizationId/invitations` | ✓ | Lista las invitaciones pendientes |
| `DELETE /v1/organizations/:organizationId/invitations/:id` | ✓ | Revoca una invitacion |
| `GET /v1/invitations/:token` | - | Vista previa publica: organizacion, quien invita y el rol ofrecido |
| `POST /v1/invitations/:token/accept` | ✓ | Acepta la invitacion (el correo de la cuenta debe coincidir con el invitado) |
| `POST /v1/organizations/:organizationId/projects` | ✓ | Crea un proyecto (`project:create`) |
| `GET /v1/organizations/:organizationId/projects` | ✓ | Lista proyectos, paginado, con filtro `status` |
| `GET .../projects/:projectId` | ✓ | Un proyecto (`project:read`) |
| `PATCH .../projects/:projectId` | ✓ | Edita el proyecto (`project:update`) |
| `DELETE .../projects/:projectId` | ✓ | Borra el proyecto (logico); sus tareas dejan de listarse (`project:delete`) |
| `POST .../projects/:projectId/archive` | ✓ | Archiva el proyecto (`project:update`) |
| `POST .../projects/:projectId/unarchive` | ✓ | Lo vuelve a activar (`project:update`) |
| `POST .../projects/:projectId/tasks` | ✓ | Crea una tarea, numerada automaticamente (`task:create`) |
| `GET .../projects/:projectId/tasks` | ✓ | Lista tareas del proyecto, paginado, con filtros y orden (`task:read`) |
| `GET .../tasks/:taskId` | ✓ | Una tarea (`task:read`) |
| `PATCH .../tasks/:taskId` | ✓ | Edita la tarea; exige `version`, 409 si no coincide (creador/responsable, o `task:update:any`) |
| `DELETE .../tasks/:taskId` | ✓ | Borra la tarea (logico) (creador/responsable, o `task:delete:any`) |
| `POST .../tasks/:taskId/assign` | ✓ | Asigna la tarea a un miembro de la organizacion (`task:assign`) |
| `POST .../tasks/:taskId/unassign` | ✓ | Le quita el responsable (`task:assign`) |
| `GET /v1/organizations/:organizationId/tasks` | ✓ | Tareas asignadas al usuario en toda la organizacion, mismos filtros |
| `POST .../tasks/:taskId/comments` | ✓ | Comenta la tarea (`comment:create`) |
| `GET .../tasks/:taskId/comments` | ✓ | Lista comentarios, paginado, orden cronologico (`task:read`) |
| `PATCH .../comments/:commentId` | ✓ | Edita un comentario; solo el autor (`comment:update:own`) |
| `DELETE .../comments/:commentId` | ✓ | Borra un comentario (autor con `comment:delete:own`, o `comment:delete:any`) |
| `POST /v1/organizations/:organizationId/labels` | ✓ | Crea una etiqueta (`label:manage`) |
| `GET /v1/organizations/:organizationId/labels` | ✓ | Lista las etiquetas de la organizacion (`task:read`) |
| `PATCH .../labels/:labelId` | ✓ | Renombra o recolorea una etiqueta (`label:manage`) |
| `DELETE .../labels/:labelId` | ✓ | Borra la etiqueta; la desvincula de sus tareas sin borrarlas (`label:manage`) |
| `PUT .../tasks/:taskId/labels` | ✓ | Fija el conjunto completo de etiquetas de la tarea (creador/responsable, o `task:update:any`) |
| `GET .../tasks/:taskId/activity` | ✓ | Bitacora de la tarea, paginada, mas reciente primero (`task:read`; sin endpoint de escritura) |
| `POST /v1/organizations/:organizationId/webhooks` | ✓ | Crea un webhook; devuelve el secreto una sola vez (`webhook:manage`) |
| `GET /v1/organizations/:organizationId/webhooks` | ✓ | Lista los webhooks, sin el secreto (`webhook:manage`) |
| `PATCH .../webhooks/:webhookId` | ✓ | Edita url/eventos/`enabled` (`webhook:manage`) |
| `DELETE .../webhooks/:webhookId` | ✓ | Borra el webhook (`webhook:manage`) |
| `POST .../webhooks/:webhookId/rotate-secret` | ✓ | Rota el secreto; lo devuelve una sola vez (`webhook:manage`) |
| `POST .../webhooks/:webhookId/test` | ✓ | Dispara un evento de prueba por el mismo pipeline real (`webhook:manage`) |
| `GET .../webhooks/:webhookId/deliveries` | ✓ | Historial de entregas, paginado (`webhook:manage`) |
| `POST /v1/organizations/:organizationId/api-keys` | ✓ | Crea una API key; devuelve la clave completa una sola vez (`apikey:manage`) |
| `GET /v1/organizations/:organizationId/api-keys` | ✓ | Lista las API keys (prefijo, scopes, ultimo uso; nunca la clave) (`apikey:manage`) |
| `DELETE .../api-keys/:apiKeyId` | ✓ | Revoca una API key (`apikey:manage`) |

A un usuario que no es miembro de la organizacion, todas las rutas bajo
`/v1/organizations/:organizationId` le responden 404 (nunca 403): no se
revela si la organizacion existe. Lo mismo pasa con un proyecto o una tarea
que no existen, pertenecen a otra organizacion, o estan borrados.

### Proyectos y tareas

Cada proyecto tiene una `key` unica dentro de su organizacion, de 2 a 5
letras mayusculas (`ENG`, `WEB`, `OPS`). Las tareas se numeran dentro de su
proyecto (1, 2, 3...); el numero se asigna incrementando un contador en la
misma transaccion que crea la tarea, para que dos creaciones simultaneas
nunca reciban el mismo numero (ver
[`apps/api/src/modules/tasks/tasks.repository.ts`](./apps/api/src/modules/tasks/tasks.repository.ts),
metodo `createWithNextNumber`).

Actualizar una tarea (`PATCH`) exige mandar la `version` que se leyo; si ya
no coincide con la de la base, la respuesta es 409 (ver
[`docs/adr/0007-optimistic-locking.md`](./docs/adr/0007-optimistic-locking.md)).
Pasar el `status` a `DONE` registra `completedAt`; sacarlo de `DONE` lo
limpia. Solo se puede asignar una tarea a alguien que ya es miembro de la
organizacion; a cualquier otra persona, 422.

Los listados de proyectos y tareas se paginan por cursor, no por numero de
pagina (ver
[`docs/adr/0006-cursor-pagination.md`](./docs/adr/0006-cursor-pagination.md)):
la respuesta trae `{ "data": [...], "nextCursor": "..." }`, y `nextCursor` es
`null` cuando no hay mas paginas. `limit` por defecto es 20, maximo 100. Los
filtros de tareas son `status`, `priority`, `assigneeId`, `unassigned=true`,
`dueBefore`/`dueAfter` (ISO 8601) y `search` (coincidencia simple en el
titulo); el orden (`sortBy`) puede ser `createdAt` (por defecto), `dueDate` o
`priority`, con `sortOrder` `asc` o `desc`.

```bash
# Crear un proyecto
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/projects \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"key":"ENG","name":"Engineering"}'
PROJECT_ID="<id del proyecto creado>"

# Crear tres tareas y ver la numeracion correlativa (1, 2, 3)
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Disenar el esquema"}'
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Escribir la migracion","priority":"HIGH"}'
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Escribir tests"}'

# Filtrar por estado y por responsable
curl "http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks?status=TODO" \
  -H "Authorization: Bearer $OWNER_TOKEN"
curl "http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks?assigneeId=$OWNER_USER_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN"

# Recorrer dos paginas con el cursor
curl "http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks?limit=2" \
  -H "Authorization: Bearer $OWNER_TOKEN"
# La respuesta trae "nextCursor"; se reenvia tal cual en la siguiente llamada
curl "http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks?limit=2&cursor=<nextCursor>" \
  -H "Authorization: Bearer $OWNER_TOKEN"

# Provocar un 409 enviando una version vieja
TASK_ID="<id de una de las tareas creadas>"
curl -X PATCH http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"version":1,"title":"Primer cambio"}'
curl -i -X PATCH http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"version":1,"title":"Segundo cambio con version vieja"}'
# 409: la version ya no coincide, hay que releer la tarea primero
```

### Comentarios, etiquetas y bitacora

Los comentarios son de la tarea, en orden cronologico; solo su autor puede
editarlos, y editar deja `editedAt` marcado en la respuesta. Borrarlos puede
el autor o un `ADMIN`/`OWNER` (moderacion).

Las etiquetas son de la organizacion, no del proyecto: se reutilizan entre
proyectos, con nombre unico sin distinguir mayusculas ("Bug" y "bug" chocan)
y color hexadecimal (`#3B82F6`). `PUT .../tasks/:taskId/labels` reemplaza el
conjunto completo de etiquetas de una tarea de una vez; quien puede editar la
tarea puede cambiarle las etiquetas, sin necesitar `label:manage` (eso es
solo para crear/renombrar/borrar la etiqueta en si). El listado de tareas
acepta ademas el filtro `labelId`.

La bitacora (`GET .../tasks/:taskId/activity`) registra, sin que nadie la
escriba a mano, la creacion de la tarea y cada cambio de estado, prioridad,
responsable, fecha de vencimiento, titulo o etiquetas, mas cada comentario
nuevo -- cada entrada trae `type`, `changes: { before, after }`, quien y
cuando. Se escribe en la misma transaccion que el cambio que describe, asi
que una actualizacion que falla no deja rastro (ver
[`docs/adr/0008-activity-log.md`](./docs/adr/0008-activity-log.md)). No
existe ningun endpoint para crearla, editarla o borrarla a mano.

```bash
TASK_ID="<id de una tarea existente>"

# Comentar la tarea
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/comments \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"body":"Reviso esto manana"}'
COMMENT_ID="<id del comentario creado>"

# Editarlo (solo el autor puede) y ver editedAt
curl -X PATCH http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/comments/$COMMENT_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"body":"Reviso esto hoy mismo"}'

# Crear dos etiquetas y aplicarlas a la tarea
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/labels \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Bug","color":"#EF4444"}'
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/labels \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Urgente","color":"#F97316"}'
LABEL_ID_1="<id de Bug>"
LABEL_ID_2="<id de Urgente>"

curl -X PUT http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/labels \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"labelIds\":[\"$LABEL_ID_1\",\"$LABEL_ID_2\"]}"

# Filtrar tareas por etiqueta
curl "http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks?labelId=$LABEL_ID_1" \
  -H "Authorization: Bearer $OWNER_TOKEN"

# Cambiar estado y prioridad
curl -X PATCH http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"version":1,"status":"IN_PROGRESS","priority":"HIGH"}'

# Consultar la bitacora: cada cambio con su valor anterior y el nuevo
curl "http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/activity" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### Roles y permisos

Cuatro roles fijos, no configurables. La matriz completa vive en
[`apps/api/src/shared/authorization/permissions.ts`](./apps/api/src/shared/authorization/permissions.ts)
y se explica en
[`docs/adr/0005-permission-matrix.md`](./docs/adr/0005-permission-matrix.md).

| Permiso                | OWNER | ADMIN | MEMBER | VIEWER |
| ----------------------- | :---: | :---: | :----: | :----: |
| `organization:update`   |   ✓   |   ✓   |        |        |
| `organization:delete`   |   ✓   |       |        |        |
| `member:list`           |   ✓   |   ✓   |   ✓    |   ✓    |
| `member:update-role`    |   ✓   |   ✓   |        |        |
| `member:remove`         |   ✓   |   ✓   |        |        |
| `member:leave`          |   ✓   |   ✓   |   ✓    |   ✓    |
| `ownership:transfer`    |   ✓   |       |        |        |
| `invitation:create`     |   ✓   |   ✓   |        |        |
| `invitation:list`       |   ✓   |   ✓   |        |        |
| `invitation:revoke`     |   ✓   |   ✓   |        |        |
| `project:create`        |   ✓   |   ✓   |        |        |
| `project:read`          |   ✓   |   ✓   |   ✓    |   ✓    |
| `project:update`        |   ✓   |   ✓   |        |        |
| `project:delete`        |   ✓   |   ✓   |        |        |
| `task:create`           |   ✓   |   ✓   |   ✓    |        |
| `task:read`             |   ✓   |   ✓   |   ✓    |   ✓    |
| `task:assign`           |   ✓   |   ✓   |        |        |
| `task:update:own`       |   ✓   |   ✓   |   ✓    |        |
| `task:update:any`       |   ✓   |   ✓   |        |        |
| `task:delete:own`       |   ✓   |   ✓   |   ✓    |        |
| `task:delete:any`       |   ✓   |   ✓   |        |        |
| `task:assign:self`      |   ✓¹  |   ✓¹  |   ✓    |        |
| `comment:create`        |   ✓   |   ✓   |   ✓    |        |
| `comment:update:own`    |   ✓   |   ✓   |   ✓    |        |
| `comment:delete:own`    |   ✓   |   ✓   |   ✓    |        |
| `comment:delete:any`    |   ✓   |   ✓   |        |        |
| `label:manage`          |   ✓   |   ✓   |        |        |
| `webhook:manage`        |   ✓   |   ✓   |        |        |
| `apikey:manage`         |   ✓   |   ✓   |        |        |

¹ OWNER/ADMIN no necesitan `task:assign:self` porque ya tienen `task:assign`
(sin restricciones), que cubre autoasignarse tambien; no esta en su fila de
la matriz porque seria redundante, no porque les falte la capacidad.

No hay `comment:update:any` en ningun rol: nadie edita el comentario de
otra persona, ni el `OWNER` (ver
[`docs/adr/0005-permission-matrix.md`](./docs/adr/0005-permission-matrix.md)).
Tampoco hay `comment:read` ni `activity:read`: leer los comentarios o la
bitacora de una tarea es parte de leer esa tarea, asi que ambas rutas
reusan `task:read`.

Ademas de la matriz, un puñado de invariantes de estado se aplican siempre,
sin excepcion de rol: siempre existe exactamente un `OWNER`; no se lo puede
degradar ni expulsar; no puede abandonar la organizacion sin transferir la
propiedad antes; y ni siquiera un `ADMIN` puede modificarlo o expulsarlo.

"Propio" (`:own`), para una tarea, es ser su creador o su responsable
asignado; lo decide `tasks.service.ts` comparando ids, nunca comparando
roles. Un `MEMBER` puede crear, editar y borrar sus propias tareas (las que
creo o las que le asignaron), pero no las de otra persona; `ADMIN` y `OWNER`
pueden hacerlo con cualquier tarea del proyecto.

Las rutas marcadas con auth requieren el header `Authorization: Bearer <access_token>`.
El refresh token nunca aparece en el cuerpo de una respuesta: viaja unicamente
en una cookie `httpOnly` (`refresh_token`), que el navegador o `curl -c/-b`
manejan automaticamente. Ese mismo header tambien acepta una **API key**
(`Authorization: Bearer tp_live_...`) en vez de un JWT -- ver la seccion
[API keys](#api-keys) mas abajo.

### Webhooks: guia de integracion

Cada cambio que la [bitacora](#comentarios-etiquetas-y-bitacora) registra se
publica, en la misma transaccion que lo produce, como un `OutboxEvent` (ver
[`docs/adr/0009-outbox-pattern.md`](./docs/adr/0009-outbox-pattern.md)). El
worker lo despacha a cada webhook suscripto a ese tipo de evento, con hasta 5
reintentos con espera creciente (ver
[`docs/DEBT.md`](./docs/DEBT.md) para la unica ventana de perdida conocida).
Tras 20 fallos consecutivos, el endpoint se desactiva solo.

**Catalogo de eventos** (el mismo `type` que trae cada entrada de la
bitacora): `TASK_CREATED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`,
`ASSIGNEE_CHANGED`, `DUE_DATE_CHANGED`, `TITLE_CHANGED`, `LABELS_CHANGED`,
`COMMENT_ADDED`.

**Suscribirse:**

```bash
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/webhooks \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://mi-servidor.example.com/hooks","eventTypes":["STATUS_CHANGED","TASK_CREATED"]}'
# La respuesta trae "secret": "whsec_..." -- guardalo ahora, no vuelve a aparecer
```

**Cada entrega** llega como un `POST` con el cuerpo JSON del evento y una
cabecera `X-Webhook-Signature: t=<timestamp>,v1=<hmac-hex>` (ver
[`docs/adr/0010-webhook-signing.md`](./docs/adr/0010-webhook-signing.md)).
Para verificarla: HMAC-SHA256 de `"${t}.${body}"` con el secreto, comparado
contra `v1` con una comparacion de tiempo constante; rechazar tambien si `t`
esta a mas de 5 minutos del reloj propio.

_Node.js_ (la misma funcion que usa el propio proyecto, en
[`packages/shared/src/security/webhook-signature.ts`](./packages/shared/src/security/webhook-signature.ts)):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, rawBody, header, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const t = Number(parts.t);
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parts.v1, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

_PHP:_

```php
function verify_webhook(string $secret, string $rawBody, string $header, int $tolerance = 300): bool {
    $parts = [];
    foreach (explode(',', $header) as $pair) {
        [$key, $value] = explode('=', $pair, 2);
        $parts[$key] = $value;
    }
    if (!isset($parts['t'], $parts['v1']) || abs(time() - (int) $parts['t']) > $tolerance) {
        return false;
    }
    $expected = hash_hmac('sha256', $parts['t'] . '.' . $rawBody, $secret);
    return hash_equals($expected, $parts['v1']);
}
```

**Depurar una integracion:** `GET .../webhooks/:webhookId/deliveries` trae,
paginado, cada intento con su codigo de respuesta, duracion y un fragmento
del cuerpo devuelto. `POST .../webhooks/:webhookId/test` manda un evento
ficticio por el mismo circuito real, sin esperar a que ocurra un cambio de
verdad.

### API keys

Credenciales de organizacion (no de un usuario particular), pensadas para
integraciones de servidor a servidor. Llevan un prefijo visible
(`tp_live_...`) y solo se guarda su hash; la clave completa se muestra una
sola vez, al crearla.

Los `scopes` de una key son su propia lista de permisos, del mismo
vocabulario que la matriz de roles. Una key no "actua como" quien la creo.

#### Catalogo de scopes

| Tipo | Scope | Que permite |
|---|---|---|
| Lectura | `project:read` | Listar y leer proyectos |
| Lectura | `task:read` | Listar y leer tareas, sus comentarios, su bitacora y el catalogo de etiquetas |
| Lectura | `member:list` | Listar los miembros de la organizacion |
| Escritura | `project:create` | Crear proyectos |
| Escritura | `project:update` | Editar, archivar y desarchivar proyectos |
| Escritura | `task:create` | Crear tareas |
| Escritura | `task:update:any` | Editar cualquier tarea y fijar sus etiquetas |
| Escritura | `task:assign` | Asignar y desasignar cualquier tarea a cualquier miembro |
| Escritura | `comment:create` | Comentar tareas |
| Escritura | `label:manage` | Crear, renombrar, recolorear y borrar etiquetas |

Nada mas se puede conceder a una key, ni siquiera por el `OWNER`:

- **Borrados** (`project:delete`, `task:delete:any`, `comment:delete:any`): la
  fase habilita crear y modificar, no borrar.
- **Variantes `:own` y `task:assign:self`**: una key no es autora ni
  responsable de nada, asi que "lo propio" no le aplica. Por eso los scopes de
  escritura usan siempre la variante `:any`. Una key que crea una tarea no
  gana ningun derecho sobre ella: para editarla necesita `task:update:any`.
- **Gestion de personas e integraciones** (`member:update-role`,
  `member:remove`, `invitation:*`, `organization:*`, `ownership:transfer`,
  `webhook:manage`, `apikey:manage`): una key que gestiona otras keys o
  webhooks seria una via de escalada sin caso de uso legitimo.

El porque de cada exclusion esta en
[`apps/api/src/shared/authorization/api-key-scopes.ts`](./apps/api/src/shared/authorization/api-key-scopes.ts).

#### Reglas al crear una key

Cada scope pedido pasa tres controles, en este orden:

1. **Existe** en el vocabulario de permisos. Si no: `422`.
2. **Quien crea la key lo tiene** por su propio rol en la matriz. Si no:
   `403`. Un `ADMIN` no puede fabricar una key con permisos que el no tiene
   (por ejemplo `organization:delete`).
3. **Es concedible a una key** segun el catalogo de arriba. Si no: `422`.

#### Autoria y bitacora

Lo que escribe una key queda a nombre de la key, nunca de la persona que la
creo:

- Las tareas y los proyectos llevan `createdById: null` y `createdByApiKeyId`.
- Los comentarios llevan `authorId: null`, `author: null`, `authorApiKeyId` y
  `authorApiKey` (`id`, `name` y `prefix`).
- La bitacora registra `actor: { "type": "API_KEY", "id", "name", "prefix" }`,
  y el evento de webhook, `actor: { "type": "API_KEY", "id" }`.

```bash
# Crear una key que puede leer y crear tareas
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/api-keys \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"CI bot","scopes":["task:read","task:create"]}'
# La respuesta trae "key": "tp_live_..." -- guardala ahora, no vuelve a aparecer
API_KEY="<key de la respuesta>"

# Crea una tarea a su nombre: createdById es null, createdByApiKeyId es la key
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Deploy nocturno"}'
TASK_ID="<id de la respuesta>"

# La bitacora la registra como actor API_KEY
curl http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID/activity \
  -H "Authorization: Bearer $OWNER_TOKEN"

# No puede editar la tarea que ella misma creo (403: sin task:update:any)
curl -i -X PATCH http://localhost:3000/v1/organizations/$ORG_ID/projects/$PROJECT_ID/tasks/$TASK_ID \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Otro titulo","version":1}'

# Un ADMIN no puede crear una key con un permiso que no tiene (403)
curl -i -X POST http://localhost:3000/v1/organizations/$ORG_ID/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Escalada","scopes":["organization:delete"]}'
```

### Verificacion de correo y recuperacion de contraseña

- **La verificacion no bloquea nada.** Una cuenta sin verificar usa la API
  con normalidad. `GET /v1/auth/me` expone `emailVerifiedAt` para que un
  cliente muestre un aviso. Aceptar una invitacion tambien verifica el
  correo. Ver [ADR 0011](./docs/adr/0011-account-recovery.md).
- **Los enlaces apuntan al cliente web** (`WEB_APP_URL`), con el token en el
  fragmento: `.../verify-email#token=...` y `.../reset-password#token=...`. El
  fragmento nunca llega a ningun servidor. La pagina toma el token y lo manda
  por `POST` a la API. Mientras no exista el cliente web, se copia el token del
  correo en Mailpit.
- **Los tokens son de un solo uso**: la verificacion vence en 24 horas y la
  recuperacion en 1 hora. Un token desconocido, usado o vencido recibe el
  mismo `404`.
- **`forgot-password` responde siempre igual**, exista o no la cuenta, y en
  el mismo tiempo: la API solo encola la solicitud, y el worker busca la
  cuenta y envia el correo.
  - El limite por IP responde `429`.
  - El limite por cuenta (3 por hora) descarta la solicitud en silencio, sin
    `429`, para no revelar si el correo existe.
- **Restablecer cierra todas las sesiones**, incluida la del navegador que lo
  pidio, a diferencia de `POST /v1/users/me/password`, que conserva la actual.
  Un access token ya emitido sigue valido hasta que vence (15 minutos como
  mucho). Ver [ADR 0011](./docs/adr/0011-account-recovery.md).

```bash
# 1. Registrarse: se encola el correo de verificacion
curl -s -c cookies.txt -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"grace@example.com","password":"correct-horse-battery","name":"Grace"}'
ACCESS_TOKEN="<accessToken de la respuesta>"

# 2. Ver el correo en Mailpit (http://localhost:8025) y sacar el token del enlace
VERIFY_TOKEN=$(curl -s http://localhost:8025/api/v1/message/latest | grep -o 'token=[A-Za-z0-9_-]*' | head -1 | cut -d= -f2)

# 3. Verificar (204) y comprobar que el perfil lo refleja
curl -i -X POST http://localhost:3000/v1/auth/verify-email \
  -H "Content-Type: application/json" -d "{\"token\":\"$VERIFY_TOKEN\"}"
curl -s http://localhost:3000/v1/auth/me -H "Authorization: Bearer $ACCESS_TOKEN"

# 4. Pedir recuperacion con un correo inexistente y con uno real: misma respuesta
curl -i -X POST http://localhost:3000/v1/auth/forgot-password \
  -H "Content-Type: application/json" -d '{"email":"nadie@example.com"}'
curl -i -X POST http://localhost:3000/v1/auth/forgot-password \
  -H "Content-Type: application/json" -d '{"email":"grace@example.com"}'

# 5. Sacar el token del correo de recuperacion y comprobar que sigue valido (200)
RESET_TOKEN=$(curl -s http://localhost:8025/api/v1/message/latest | grep -o 'token=[A-Za-z0-9_-]*' | head -1 | cut -d= -f2)
curl -s http://localhost:3000/v1/auth/reset-password/$RESET_TOKEN

# 6. Restablecer (204)
curl -i -X POST http://localhost:3000/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$RESET_TOKEN\",\"newPassword\":\"una-contraseña-nueva-y-larga\"}"

# 7. La sesion anterior ya no sirve (401), y el token tampoco sirve dos veces (404)
curl -i -b cookies.txt -X POST http://localhost:3000/v1/auth/refresh
curl -i http://localhost:3000/v1/auth/reset-password/$RESET_TOKEN
```

### Recorrido completo con curl

```bash
# 1. Registrarse (guarda la cookie del refresh token en cookies.txt)
curl -i -c cookies.txt -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"correct-horse-battery","name":"Ada"}'
# La respuesta trae { "user": {...}, "accessToken": "...", "expiresInSeconds": 900 }

ACCESS_TOKEN="<pegar el accessToken de la respuesta anterior>"

# 2. Perfil propio
curl http://localhost:3000/v1/auth/me -H "Authorization: Bearer $ACCESS_TOKEN"

# 3. Renovar la sesion (rota el refresh token; guarda el nuevo en cookies.txt)
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/v1/auth/refresh
# La respuesta trae un accessToken nuevo

NEW_ACCESS_TOKEN="<pegar el accessToken de la respuesta anterior>"

# 4. Volver a pedir el perfil, ahora con el token nuevo
curl http://localhost:3000/v1/auth/me -H "Authorization: Bearer $NEW_ACCESS_TOKEN"

# 5. Cerrar sesion
curl -i -b cookies.txt -X POST http://localhost:3000/v1/auth/logout

# 6. El refresh token ya cerrado no sirve mas (debe responder 401)
curl -i -b cookies.txt -X POST http://localhost:3000/v1/auth/refresh
```

### Recorrido de roles e invitaciones

```bash
# 1. La owner ya tiene su organizacion personal (creada en el registro)
curl -c owner.txt -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"correct-horse-battery","name":"Owner"}'
OWNER_TOKEN="<accessToken de la respuesta>"

curl http://localhost:3000/v1/organizations -H "Authorization: Bearer $OWNER_TOKEN"
ORG_ID="<id de la organizacion listada>"

# 2. Invitar a un segundo usuario como MEMBER
curl -X POST http://localhost:3000/v1/organizations/$ORG_ID/invitations \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"member@example.com","role":"MEMBER"}'
# El enlace ya no viene en la respuesta (ver docs/DEBT.md, resuelto en la
# Fase 4): se envia por correo. En desarrollo, Mailpit lo recibe en
# http://localhost:8025 -- abrilo ahi y copia el token de la URL "Aceptar
# invitacion", o mira el correo mas nuevo con:
curl -s "http://localhost:8025/api/v1/messages" | grep -o '"ID":"[^"]*"' | head -1

# 3. La invitada se registra y acepta con su propia cuenta
curl -c member.txt -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"member@example.com","password":"correct-horse-battery","name":"Member"}'
MEMBER_TOKEN="<accessToken de la respuesta>"

curl -X POST http://localhost:3000/v1/invitations/<token>/accept \
  -H "Authorization: Bearer $MEMBER_TOKEN"

# 4. Como MEMBER, no puede expulsar a nadie (403)
curl -i -X DELETE http://localhost:3000/v1/organizations/$ORG_ID/members/<owner-user-id> \
  -H "Authorization: Bearer $MEMBER_TOKEN"

# 5. La owner la asciende a ADMIN
curl -X PATCH http://localhost:3000/v1/organizations/$ORG_ID/members/<member-user-id> \
  -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"role":"ADMIN"}'

# 6. Como ADMIN, ahora si puede invitar...
curl -i -X POST http://localhost:3000/v1/organizations/$ORG_ID/invitations \
  -H "Authorization: Bearer $MEMBER_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"otra@example.com","role":"VIEWER"}'

# 7. ...pero sigue sin poder tocar a la owner (409: no se puede modificar al owner)
curl -i -X DELETE http://localhost:3000/v1/organizations/$ORG_ID/members/<owner-user-id> \
  -H "Authorization: Bearer $MEMBER_TOKEN"
```

## Desarrollo fuera de Docker

```bash
corepack enable
pnpm install
cp .env.example .env   # ajustar DATABASE_URL y REDIS_URL a localhost
pnpm dev
```

Scripts disponibles en la raiz del monorepo:

| Script            | Que hace                                                     |
| ----------------- | ------------------------------------------------------------ |
| `pnpm dev`        | Compila `contracts` y arranca la API con recarga en caliente |
| `pnpm build`      | Compila todos los paquetes del workspace                     |
| `pnpm test`       | Corre la suite de tests de cada paquete                      |
| `pnpm lint`       | Corre ESLint sobre todo el repositorio                       |
| `pnpm typecheck`  | Corre el chequeo de tipos de TypeScript sin emitir           |
| `pnpm db:migrate` | Aplica las migraciones de Prisma en desarrollo               |
| `pnpm db:reset`   | Resetea la base de datos de desarrollo                       |

## Estructura de carpetas

```
tasks-platform/
  apps/
    api/                  Servicio HTTP (Express + TypeScript)
    worker/               Despacha el outbox, entrega webhooks, envia correo y resuelve solicitudes de recuperacion
  packages/
    contracts/            Esquemas Zod y tipos compartidos entre API y frontend
    shared/               Config, DB, logger, firma de webhooks, colas y tokens de cuenta compartidos por api y worker
  docker/                 Dockerfile(s) de los servicios
  docs/
    adr/                  Registros de decisiones de arquitectura
  docker-compose.yml
  ARCHITECTURE.md          Contrato de arquitectura y convenciones
  PHASE.md                 Alcance de la fase actual
```

Estructura interna de `apps/api/src`:

```
src/
  modules/
    auth/                   Registro, login, refresh, logout, requireAuth
    users/                  Perfil y cambio de contraseña
    email-verification/     Verificacion de correo y reenvio con limite
    password-reset/         Solicitud, chequeo y restablecimiento de contraseña
    organizations/          Organizaciones (alta, edicion, baja)
    members/                Miembros: roles, expulsion, transferencia de propiedad
    invitations/            Invitaciones por token opaco
    projects/               Proyectos (clave, estado, contador de tareas)
    tasks/                  Tareas: numeracion, bloqueo optimista, asignacion
    comments/               Comentarios de una tarea
    labels/                 Etiquetas de la organizacion y su vinculo con tareas
    activity/               Bitacora de actividad de una tarea (solo lectura)
    outbox/                 Escritura de eventos publicables (sin endpoints propios)
    webhooks/               Endpoints salientes: CRUD, firma, entregas
    api-keys/               Credenciales de organizacion con scopes propios
    health/                 Health checks
    <dominio>/
      <dominio>.routes.ts       Definicion de rutas
      <dominio>.controller.ts   Traduccion HTTP <-> DTO
      <dominio>.service.ts      Reglas de negocio
      <dominio>.repository.ts   Acceso a datos (unico lugar que toca Prisma)
      <dominio>.mapper.ts       Entidad -> DTO de respuesta
  shared/
    authorization/          Matriz de permisos, actor (miembro o API key),
                             catalogo de scopes, requireMembership, requirePermission
    config/                 Configuracion tipada y validada al arranque
    db/                     Clientes de Postgres (Prisma) y Redis
    errors/                 Jerarquia de errores y middleware de errores
    http/                   Middlewares transversales (request id, logging,
                             limite de intentos, validacion de body)
    logger/                 Logger y contexto de peticion
    security/               Hashing de contraseñas (Argon2id) y tokens (JWT
                             + refresh token opaco)
  app.ts                    Construccion de la aplicacion Express
  server.ts                 Arranque del proceso y apagado ordenado
```

## Variables de entorno

Todas las variables aceptadas estan documentadas en
[`.env.example`](./.env.example). Si falta una variable obligatoria o tiene un
formato invalido, la API no arranca: el mensaje de error indica exactamente
cual es el problema.
