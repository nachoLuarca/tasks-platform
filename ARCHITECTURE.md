# Arquitectura — tasks-platform

Este documento es el contrato del proyecto. Cualquier agente o persona que
escriba código aquí debe leerlo primero y respetarlo sin excepciones.
Si algo de este documento entra en conflicto con una instrucción puntual,
gana este documento: primero se discute el cambio, después se escribe código.

---

## 1. Qué es este proyecto

API multi-tenant de gestión de tareas. Organizaciones con usuarios, roles y
permisos granulares; proyectos y tareas; superficie de integración vía API keys
y webhooks salientes.

El protagonista es la API. El frontend incluido es un cliente de demostración,
no un producto en sí mismo.

---

## 2. Decisiones de arquitectura ya tomadas

**Monolito modular, no microservicios.** No hay necesidad de escalado
independiente ni fronteras de equipo. Los módulos están aislados para poder
extraer uno a un servicio aparte si algún día hiciera falta, pero hoy corren
en un solo proceso.

**Monorepo con workspaces.** La API, el worker, el frontend y el paquete de
contratos comparten repositorio para que los esquemas de validación sean la
única fuente de verdad entre backend y frontend.

**Módulos por dominio, no por capa técnica.** La carpeta de primer nivel dice
qué hace el sistema, no con qué está construido.

---

## 3. Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 24 LTS |
| Lenguaje | TypeScript en modo `strict` |
| HTTP | Express 5 |
| Base de datos | PostgreSQL 17 |
| Acceso a datos | Prisma |
| Validación | Zod |
| Hashing | Argon2id |
| Logging | Pino |
| Cola | Redis + BullMQ |
| Correo (local) | Mailpit |
| Tests | Vitest + Supertest |
| Contenedores | Docker + Docker Compose |
| Gestor de paquetes | pnpm workspaces |

No se agregan dependencias fuera de esta lista sin justificarlo primero.

---

## 4. Estructura del monorepo

```
tasks-platform/
  apps/
    api/                  Servicio HTTP
    worker/               Consumidor de la cola
    web/                  Cliente de demostración (React + Vite)
  packages/
    contracts/            Esquemas Zod y tipos compartidos
  docker/                 Dockerfiles y configuración de contenedores
  docs/
    adr/                  Registros de decisiones de arquitectura
  docker-compose.yml
  ARCHITECTURE.md
  PHASE.md
```

### Estructura interna de `apps/api`

```
src/
  modules/
    <dominio>/
      <dominio>.routes.ts       Definición de rutas
      <dominio>.controller.ts   Traducción HTTP ↔ DTO
      <dominio>.service.ts      Reglas de negocio y transacciones
      <dominio>.repository.ts   Acceso a datos (interfaz + implementación)
      <dominio>.schema.ts       Esquemas Zod de entrada y salida
      <dominio>.mapper.ts       Entidad ↔ DTO
      <dominio>.types.ts        Tipos del dominio
  shared/
    config/                 Configuración tipada y validada al arranque
    db/                     Cliente de base de datos
    errors/                 Jerarquía de errores y middleware
    http/                   Middlewares transversales
    logger/                 Logger y contexto de petición
  app.ts                    Construcción de la aplicación Express
  server.ts                 Arranque del proceso
```

---

## 5. Regla de capas

El flujo de dependencias es en una sola dirección:

```
routes → controller → service → repository → base de datos
```

Reglas que no se rompen:

- El **controller** traduce entre HTTP y el dominio. No contiene lógica de
  negocio y no conoce el ORM.
- El **service** contiene las reglas de negocio y controla las transacciones.
  No conoce `req`, `res` ni ningún concepto de HTTP.
- El **repository** es lo único que toca el ORM. Devuelve entidades del
  dominio, nunca modelos de Prisma.
- El **mapper** convierte entidades a DTO de respuesta. Ningún modelo interno
  se serializa directamente a la respuesta HTTP.
- Un módulo **no importa el interior de otro módulo**. Si necesita algo de
  otro dominio, lo pide a través del servicio público de ese dominio.

---

## 6. Convenciones

- Código, nombres de archivo, identificadores y comentarios en **inglés**.
- Documentación y README en **español**.
- Archivos en `kebab-case`, clases en `PascalCase`, funciones y variables en
  `camelCase`, constantes de entorno en `SCREAMING_SNAKE_CASE`.
- Toda entrada externa se valida con Zod antes de llegar al service.
- Ningún secreto en el repositorio. La configuración se lee de variables de
  entorno y se valida al arranque: si falta una, el proceso no levanta.
- Los errores se responden en formato RFC 9457 (Problem Details).
- Toda petición lleva un `requestId` que aparece en todos sus logs.

---

## 7. Flujo de git

- `main` es la rama estable y siempre desplegable. **No se commitea directo a
  `main`.**
- Todo cambio nace en una rama corta, de uno a tres días de vida:
  `feat/<descripcion>`, `fix/<descripcion>`, `chore/<descripcion>`,
  `docs/<descripcion>`.
- La rama se integra mediante Pull Request. El merge se hace con
  `--no-ff` y la rama se borra después.
- Los mensajes de commit siguen Conventional Commits, en inglés e imperativo:
  `feat: add refresh token rotation`, `fix: handle expired jwt`.
- No se mergea con la suite de tests en rojo.
- No se hace `force-push` sobre ramas compartidas.
- Cada fase cerrada se marca con un tag `vX.Y.Z`.
- `main` despliega a staging. Solo un tag despliega a producción.

---

## 8. Reglas para el agente

1. Leer este archivo y `PHASE.md` antes de escribir cualquier código.
2. Trabajar **solo** sobre el alcance de la fase actual. No adelantar trabajo
   de fases posteriores aunque parezca conveniente.
3. Crear la rama correspondiente antes del primer cambio. Nunca commitear en
   `main`.
4. Si una decisión no está cubierta por este documento, detenerse y preguntar
   en lugar de improvisar.
5. Al terminar, dejar un resumen de qué se hizo, qué quedó fuera y qué hay que
   verificar a mano.
