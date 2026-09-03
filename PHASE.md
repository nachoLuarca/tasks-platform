# Fase actual: 0 — Cimientos

**Objetivo:** dejar el esqueleto del proyecto funcionando end to end, sin nada
de dominio. Al terminar, `docker compose up` debe levantar todo y la API debe
responder en `/health`.

**Rama:** `feat/project-foundation`
**Tag al cerrar:** `v0.1.0`

---

## Alcance

### Monorepo
- [ ] `pnpm-workspace.yaml` con `apps/*` y `packages/*`
- [ ] `package.json` raíz con scripts: `dev`, `build`, `test`, `lint`, `typecheck`
- [ ] TypeScript en modo `strict`, configuración base compartida
- [ ] ESLint y Prettier configurados y pasando
- [ ] `.gitignore`, `.editorconfig`, `.nvmrc`
- [ ] `.env.example` con todas las variables documentadas

### apps/api
- [ ] Express 5 con TypeScript
- [ ] Configuración tipada, validada con Zod al arranque: si falta una variable
      obligatoria, el proceso falla con un mensaje claro
- [ ] Logger Pino con `requestId` propagado por AsyncLocalStorage
- [ ] Middleware de manejo de errores centralizado
- [ ] Jerarquía de errores de aplicación (`AppError` y descendientes)
- [ ] Respuestas de error en formato RFC 9457 (Problem Details)
- [ ] `GET /health/live` — el proceso está vivo
- [ ] `GET /health/ready` — dependencias alcanzables (base de datos, Redis)
- [ ] Middlewares base: helmet, cors, compresión, límite de tamaño de cuerpo
- [ ] Apagado ordenado ante SIGTERM

### packages/contracts
- [ ] Paquete inicializado con Zod como dependencia
- [ ] Un esquema de ejemplo exportado, para validar que el workspace resuelve
      correctamente desde `apps/api`

### Base de datos
- [ ] Prisma inicializado apuntando a PostgreSQL
- [ ] Migración inicial vacía o mínima que corre sin errores
- [ ] Script de migración incluido en los scripts del proyecto

### Docker
- [ ] `docker-compose.yml` con: `api`, `db` (PostgreSQL 17), `redis`, `mailpit`
- [ ] Volúmenes nombrados para persistencia de la base
- [ ] Healthchecks reales en cada servicio
- [ ] `depends_on` con `condition: service_healthy`
- [ ] Dockerfile de la API multi-stage, usuario no root
- [ ] Recarga en caliente funcionando en desarrollo

### Tests
- [ ] Vitest configurado
- [ ] Al menos un test de integración con Supertest contra `/health/live`
- [ ] `pnpm test` pasa en verde

### Documentación
- [ ] `README.md` en español: qué es el proyecto, requisitos, cómo levantarlo
- [ ] `docs/adr/0001-modular-monolith.md` — por qué monolito modular
- [ ] `docs/adr/0002-monorepo.md` — por qué monorepo con workspaces

---

## Fuera de alcance en esta fase

No implementar nada de lo siguiente, aunque parezca natural hacerlo:

- Usuarios, autenticación, JWT o sesiones
- Organizaciones o multi-tenancy
- Roles y permisos
- Proyectos, tareas, comentarios o etiquetas
- Webhooks, API keys, cola o worker
- CI en GitHub Actions
- Cualquier configuración de despliegue o infraestructura

---

## Criterio de cierre

La fase se considera terminada cuando, sobre un clon limpio del repositorio:

1. `cp .env.example .env && docker compose up` levanta los cuatro servicios
2. `curl localhost:3000/health/live` responde 200
3. `curl localhost:3000/health/ready` responde 200 con el estado de cada
   dependencia
4. `pnpm test` pasa en verde
5. `pnpm typecheck` y `pnpm lint` pasan sin errores
6. Borrar una variable obligatoria del `.env` hace que la API falle al arrancar
   con un mensaje que dice cuál falta

Cumplido eso: Pull Request, merge con `--no-ff` a `main`, y tag `v0.1.0`.
