# tasks-platform

[![CI](https://github.com/nachoLuarca/tasks-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/nachoLuarca/tasks-platform/actions/workflows/ci.yml)

API multi-tenant de gestion de tareas: organizaciones con usuarios, roles y
permisos granulares, proyectos y tareas, y una superficie de integracion via
API keys y webhooks salientes. El protagonista del proyecto es la API; el
cliente frontend incluido (`apps/web`, en fases posteriores) es solo un
cliente de demostracion.

La Fase 0 (`v0.1.0`) dejo el esqueleto del proyecto funcionando de punta a
punta, sin logica de dominio. La Fase 1 (`Identidad`, en curso) agrega
usuarios, organizaciones y el ciclo completo de autenticacion: registro,
login, renovacion de sesion con rotacion de refresh token, cierre de sesion y
gestion basica de perfil. El detalle de alcance de la fase actual esta en
[`PHASE.md`](./PHASE.md); las decisiones de arquitectura y las convenciones
del proyecto estan en [`ARCHITECTURE.md`](./ARCHITECTURE.md).

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
| `GET /v1/organizations/:id`  |       ✓       | Una organizacion, solo si el usuario es miembro (404 si no) |

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
    organizations/          Organizaciones y membresia
    health/                 Health checks
    <dominio>/
      <dominio>.routes.ts       Definicion de rutas
      <dominio>.controller.ts   Traduccion HTTP <-> DTO
      <dominio>.service.ts      Reglas de negocio
      <dominio>.repository.ts   Acceso a datos (unico lugar que toca Prisma)
      <dominio>.mapper.ts       Entidad -> DTO de respuesta
  shared/
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
