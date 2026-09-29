# Changelog

Desde `v0.8.0` este archivo lo escribe [release-please](https://github.com/googleapis/release-please)
a partir de los Conventional Commits (ver [`CONTRIBUTING.md`](./CONTRIBUTING.md)): no se edita a
mano. Las entradas de `v0.1.0` a `v0.7.0` se reconstruyeron una sola vez, a partir de los tags de
cada fase y de los commits `feat` y `fix` que cada uno incluye, con el mismo formato que usa
release-please.

## [0.8.1](https://github.com/nachoLuarca/tasks-platform/compare/v0.8.0...v0.8.1) (2026-09-24)


### Bug Fixes

* **api:** answer malformed JSON bodies with 400 Problem Details ([8262f83](https://github.com/nachoLuarca/tasks-platform/commit/8262f83271bcfd458d3e0165ab6d5c33b42225a5))
* **api:** respond 503 Problem Details when Redis is unreachable ([b0e9eb7](https://github.com/nachoLuarca/tasks-platform/commit/b0e9eb725aa4d08095bbb8bbdbb6bce5acdb301f))
* **shared:** use TLS for rediss:// and fail fast when Redis is down ([39abda0](https://github.com/nachoLuarca/tasks-platform/commit/39abda029abf6b80b45a9cf15f54db14925263ff))

## [0.8.0](https://github.com/nachoLuarca/tasks-platform/compare/v0.7.0...v0.8.0) (2026-09-14)


### Features

* generate the OpenAPI 3.1 document from the Zod contracts ([9177d23](https://github.com/nachoLuarca/tasks-platform/commit/9177d23a8e21c7f18b271d4603cd4b7c3cd696c2))
* serve the OpenAPI document and Swagger UI ([1ce5e69](https://github.com/nachoLuarca/tasks-platform/commit/1ce5e6955fab9619c5de5f00a8c1a68ac56b9eaa))

## [0.7.0](https://github.com/nachoLuarca/tasks-platform/compare/v0.6.0...v0.7.0) (2026-09-11)

Fase 4.5: cuenta y credenciales ([#11](https://github.com/nachoLuarca/tasks-platform/pull/11)).

### Features

* add account token models and a shared token service ([148bff1](https://github.com/nachoLuarca/tasks-platform/commit/148bff1f3adac6deeeb5c5ff6cac89403aa6f033))
* let API keys write with :any scopes, in their own name ([514f577](https://github.com/nachoLuarca/tasks-platform/commit/514f577385009dd099c8ce2bde7e3648c563ca3d))
* add email verification ([64f209c](https://github.com/nachoLuarca/tasks-platform/commit/64f209c717c511991831ddbfc685e378142518f7))
* add password recovery ([a108d54](https://github.com/nachoLuarca/tasks-platform/commit/a108d54f12ac4bad2a582e466ad1849e4cb3001d))

### Bug Fixes

* keep tokens in URL paths out of the access log ([7774d37](https://github.com/nachoLuarca/tasks-platform/commit/7774d373f55bc1951ff2d9b9e7d2fd1b4b2e16b6))

## [0.6.0](https://github.com/nachoLuarca/tasks-platform/compare/v0.5.0...v0.6.0) (2026-09-10)

Fase 4: webhooks, API keys y worker ([#10](https://github.com/nachoLuarca/tasks-platform/pull/10)).

### Features

* add outbox, webhook, api key and dual-actor activity data model ([2b0bc73](https://github.com/nachoLuarca/tasks-platform/commit/2b0bc73696ccb0ad7bb522623a5fbeaea098b5ea))
* mirror the activity log into outbox events ([d6867d0](https://github.com/nachoLuarca/tasks-platform/commit/d6867d0160e94ba2f4470abc9d58b6e25342ce28))
* add API key authentication, org-scoped scopes, and management ([a028fd6](https://github.com/nachoLuarca/tasks-platform/commit/a028fd6fc334d58fdf84e50b7945ce97b37efe7e))
* add webhook endpoint CRUD, signing, and test-send ([106d10d](https://github.com/nachoLuarca/tasks-platform/commit/106d10d9683d811ec8b148800ab55977b19c1146))
* build the worker process ([6476680](https://github.com/nachoLuarca/tasks-platform/commit/647668070423b2dbf1f55de53ebf92d051fcc558))
* send the invitation link by email instead of returning it ([842e21a](https://github.com/nachoLuarca/tasks-platform/commit/842e21ab95fc4f3265635c679c48e170f35ee487))

### Bug Fixes

* harden docker dev startup and prevent api/worker tests colliding ([80f3d25](https://github.com/nachoLuarca/tasks-platform/commit/80f3d250b23f3f6cd5e845dd32fc84b623095e22))
* add Mailpit to CI and widen dev healthcheck start_period ([66ae08e](https://github.com/nachoLuarca/tasks-platform/commit/66ae08e47b34b839573f697a22f2bdc414e91f5c))

## [0.5.0](https://github.com/nachoLuarca/tasks-platform/compare/v0.4.0...v0.5.0) (2026-09-08)

Fase 3.5: comentarios, etiquetas y bitacora ([#9](https://github.com/nachoLuarca/tasks-platform/pull/9)).

### Features

* add comment, label, and task activity data model ([49f58e5](https://github.com/nachoLuarca/tasks-platform/commit/49f58e5179309be5401a11e2f61dc73e9c747e24))
* add comment, label, and self-assignment permissions ([60befeb](https://github.com/nachoLuarca/tasks-platform/commit/60befeb7fcebc85693ac0d2356d5388dd24342ff))
* add task activity log module (record + read-only listing) ([c2b24a3](https://github.com/nachoLuarca/tasks-platform/commit/c2b24a38b06424642aa1203bb176fc330af59d64))
* add task comments module ([71e4f51](https://github.com/nachoLuarca/tasks-platform/commit/71e4f518fc8d022f30d55ec31bc5d30b29468716))
* add organization labels module ([a39199a](https://github.com/nachoLuarca/tasks-platform/commit/a39199a51a7a154f48c29d6b2eb1018b1cfdf39a))
* wire tasks to labels, activity log, and self-assignment ([eedc109](https://github.com/nachoLuarca/tasks-platform/commit/eedc109adc9b631eb566e07d2f43df3dd4ddc0bd))

## [0.4.0](https://github.com/nachoLuarca/tasks-platform/compare/v0.3.0...v0.4.0) (2026-09-08)

Fase 3: proyectos y tareas ([#8](https://github.com/nachoLuarca/tasks-platform/pull/8)). Incluye tambien
[#7](https://github.com/nachoLuarca/tasks-platform/pull/7), mergeado a `main` entre las dos fases.

### Features

* add project and task data model ([a80ec45](https://github.com/nachoLuarca/tasks-platform/commit/a80ec456028c24b797ce7786efeeaa1ffa49f530))
* add project and task permissions, cursor pagination and query validation ([5bc79d2](https://github.com/nachoLuarca/tasks-platform/commit/5bc79d25240a166c90e193ae0830f89233fbeb9e))
* add tasks module with atomic numbering and optimistic locking ([109f5e3](https://github.com/nachoLuarca/tasks-platform/commit/109f5e353b92a0a59855c6a56e2576bbbba97df7))
* add projects module and wire routes under organizations ([6c55692](https://github.com/nachoLuarca/tasks-platform/commit/6c55692556abcf2edd2066330685a5895b4696d3))

### Bug Fixes

* run api container as host user to avoid root-owned files ([17477b2](https://github.com/nachoLuarca/tasks-platform/commit/17477b2ec24be641885e430f1f85e5c8c4a9201f))
* shadow Express 5 read-only req.query getter in validateQuery ([5d7087c](https://github.com/nachoLuarca/tasks-platform/commit/5d7087cbe3be9ee721a94dde5c64c8feaafaab0b))
* drop needless async from synchronous getById handlers ([67be25a](https://github.com/nachoLuarca/tasks-platform/commit/67be25a7ff7884f60c2179528643defc87804eb4))

## [0.3.0](https://github.com/nachoLuarca/tasks-platform/compare/v0.2.1...v0.3.0) (2026-09-07)

Fase 2: roles, permisos e invitaciones ([#6](https://github.com/nachoLuarca/tasks-platform/pull/6)).

### Features

* add role enum and invitation model ([fd6c03a](https://github.com/nachoLuarca/tasks-platform/commit/fd6c03a5df854915a9e7e6029745d4640c22414a))
* add permission matrix and membership authorization middlewares ([21fbb09](https://github.com/nachoLuarca/tasks-platform/commit/21fbb09979c5903e0b4e393f42d35dc903bee28d))
* add member management with owner invariants ([0cd3c8d](https://github.com/nachoLuarca/tasks-platform/commit/0cd3c8dc23913039370a782e324188a422e8a067))
* add invitations and gate organization writes behind permissions ([2004168](https://github.com/nachoLuarca/tasks-platform/commit/200416804c0f113c70415725821f22030c789f90))

## [0.2.1](https://github.com/nachoLuarca/tasks-platform/compare/v0.2.0...v0.2.1) (2026-09-07)

Fase 1.5: CI y deuda tecnica ([#5](https://github.com/nachoLuarca/tasks-platform/pull/5)).

### Bug Fixes

* build contracts and generate prisma client after source is copied ([c8ccb28](https://github.com/nachoLuarca/tasks-platform/commit/c8ccb284e0ea9ecfb6aaa959b45f6fd73d9c99e6))

## [0.2.0](https://github.com/nachoLuarca/tasks-platform/compare/v0.1.0...v0.2.0) (2026-09-04)

Fase 1: identidad, organizaciones y autenticacion con refresh token rotativo
([#4](https://github.com/nachoLuarca/tasks-platform/pull/4)). Incluye tambien
[#2](https://github.com/nachoLuarca/tasks-platform/pull/2) y
[#3](https://github.com/nachoLuarca/tasks-platform/pull/3), mergeados a `main` durante la fase.

### Features

* add auth, argon2 and rate-limit config ([3405432](https://github.com/nachoLuarca/tasks-platform/commit/3405432dca92af13df5f85aa484d7b9fe69389de))
* add identity contracts (auth, users, organizations) ([53c700f](https://github.com/nachoLuarca/tasks-platform/commit/53c700f3c5cc91ef4dcefa5980ea54364c4f3c8d))
* add identity data model (User, Organization, Membership, RefreshToken) ([413e54e](https://github.com/nachoLuarca/tasks-platform/commit/413e54efa113ee6201cda0962c00a0223dbc9d99))
* allow repositories to run inside a shared transaction ([e56bafb](https://github.com/nachoLuarca/tasks-platform/commit/e56bafba337d0bb33e8e579836a9444580099e74))
* add password hashing and access/refresh token services ([b686fca](https://github.com/nachoLuarca/tasks-platform/commit/b686fcaef668c2f7b91af4d0494726e074e4e454))
* add rate limiter, body validation and 429 problem details ([0e089f7](https://github.com/nachoLuarca/tasks-platform/commit/0e089f7769b279f95bb6527aaa1fbdc65a07d3e9))
* add organizations module ([f3321c6](https://github.com/nachoLuarca/tasks-platform/commit/f3321c64e76de0d018f6c0093533e05857c77ad6))
* add auth module (register, login, refresh rotation, logout) ([1092870](https://github.com/nachoLuarca/tasks-platform/commit/10928703966ffdd6cf3e9e01e95794d3c5bc911f))
* add users module (profile and password change) ([1146d30](https://github.com/nachoLuarca/tasks-platform/commit/1146d30ab05a8c2879a3aa430f7aabe7f03b1431))
* wire v1 auth, users and organizations routes into the app ([624e4cb](https://github.com/nachoLuarca/tasks-platform/commit/624e4cb61e1dbc6c1277d42d9b3404b407d12d89))

### Bug Fixes

* generate prisma client and build contracts on install ([f7fc5de](https://github.com/nachoLuarca/tasks-platform/commit/f7fc5dea51a19a0c01537fc23128ce80424bb619))
* redact set-cookie and token fields from logs ([a339034](https://github.com/nachoLuarca/tasks-platform/commit/a3390349297c55d2fd983a459c323dfeecbb327d))
* generate prisma client automatically on install ([a0b7b51](https://github.com/nachoLuarca/tasks-platform/commit/a0b7b510595608e084abf6e453bce1b350c8a1be))
* remove redundant postinstall now covered by the root script ([0e51e81](https://github.com/nachoLuarca/tasks-platform/commit/0e51e81bc595b851116799db35c0d19f68ba0a11))

## 0.1.0 (2026-09-03)

Fase 0: cimientos. Esqueleto del monorepo, configuracion tipada, logging con contexto de peticion,
errores RFC 9457, health checks, Prisma y Redis, Docker Compose, tests y documentacion.

### Features

* add contracts package with health schema ([75be9ad](https://github.com/nachoLuarca/tasks-platform/commit/75be9ad6e11117cb5bc46899e4f50a9a2d430761))
* add worker app scaffold ([0942da1](https://github.com/nachoLuarca/tasks-platform/commit/0942da196331d89515c3364f58d77fa4b1b81988))
* add typed environment configuration ([d813f32](https://github.com/nachoLuarca/tasks-platform/commit/d813f327e4b37f05fa46e54c37638021ecae3dab))
* add request-scoped logger with async context ([1c2d954](https://github.com/nachoLuarca/tasks-platform/commit/1c2d954813d8bdc0deb176f4f6a24ebae1db452f))
* add application error hierarchy and problem details middleware ([629e31a](https://github.com/nachoLuarca/tasks-platform/commit/629e31a44b21955fd8505c0be7d0c3198dd25597))
* add express app with base middlewares and graceful shutdown ([d3feb6e](https://github.com/nachoLuarca/tasks-platform/commit/d3feb6edf657b9249bb1bc6bb2a97c135afd490c))
* add prisma and redis clients with initial migration ([bc35bfc](https://github.com/nachoLuarca/tasks-platform/commit/bc35bfcf73c535cf5dd4e4a23daf8eef498403e0))
* add health check endpoints ([4383584](https://github.com/nachoLuarca/tasks-platform/commit/4383584458a2fe5f5d795a5a47dd919546060921))
