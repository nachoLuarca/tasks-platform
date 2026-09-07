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
gestion basica de perfil. La Fase 2 (en curso) agrega roles con permisos
granulares, gestion de miembros e invitaciones, para que una organizacion
deje de ser de una sola persona. El detalle de alcance de la fase actual esta
en [`PHASE.md`](./PHASE.md); las decisiones de arquitectura y las
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

Esto levanta cuatro servicios: la API, PostgreSQL, Redis y Mailpit (servidor
de correo local para desarrollo). La API queda escuchando en
`http://localhost:3000` con recarga en caliente sobre el codigo montado desde
el host.

Verificacion rapida:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

`/health/ready` responde 200 solo si la base de datos y Redis estan
alcanzables; si alguna falla, responde 503 indicando cual.

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
| `GET /v1/auth/me`            |       ✓       | Perfil del usuario autenticado                              |
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

A un usuario que no es miembro de la organizacion, todas las rutas bajo
`/v1/organizations/:organizationId` le responden 404 (nunca 403): no se
revela si la organizacion existe.

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

Ademas de la matriz, un puñado de invariantes de estado se aplican siempre,
sin excepcion de rol: siempre existe exactamente un `OWNER`; no se lo puede
degradar ni expulsar; no puede abandonar la organizacion sin transferir la
propiedad antes; y ni siquiera un `ADMIN` puede modificarlo o expulsarlo.

Las rutas marcadas con auth requieren el header `Authorization: Bearer <access_token>`.
El refresh token nunca aparece en el cuerpo de una respuesta: viaja unicamente
en una cookie `httpOnly` (`refresh_token`), que el navegador o `curl -c/-b`
manejan automaticamente.

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
# La respuesta trae "invitationUrl" (temporal, ver docs/DEBT.md) con el token

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
    worker/                Consumidor de la cola (sin logica todavia)
  packages/
    contracts/             Esquemas Zod y tipos compartidos entre API y frontend
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
    organizations/          Organizaciones (alta, edicion, baja)
    members/                Miembros: roles, expulsion, transferencia de propiedad
    invitations/            Invitaciones por token opaco
    health/                 Health checks
    <dominio>/
      <dominio>.routes.ts       Definicion de rutas
      <dominio>.controller.ts   Traduccion HTTP <-> DTO
      <dominio>.service.ts      Reglas de negocio
      <dominio>.repository.ts   Acceso a datos (unico lugar que toca Prisma)
      <dominio>.mapper.ts       Entidad -> DTO de respuesta
  shared/
    authorization/          Matriz de permisos, requireMembership, requirePermission
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
