# Deuda tecnica

Registro de atajos deliberados que quedaron documentados a proposito, para no
perderlos de vista. Cuando se resuelva un punto, se borra de aca (el `git log`
del commit que lo resuelve es la referencia historica).

## La imagen de runtime de la API copia el `node_modules` completo del build

**Donde:** `docker/api.Dockerfile`, stage `runtime`.

**Que pasa:** el stage `runtime` copia el `node_modules` completo del stage
`build` (que incluye devDependencies como `typescript`, `eslint`, `vitest`,
`prisma` CLI, etc.), en vez de un `node_modules` de solo produccion.

**Por que se hizo asi:** `prisma generate` necesita el CLI `prisma`, que es
una devDependency. Un stage `prod-deps` separado con `pnpm install --prod`
no tiene el CLI disponible para generar el cliente, y copiar a mano solo los
artefactos generados (`.prisma/client` + los binarios del motor) entre dos
instalaciones de node_modules distintas es fragil y facil de romper en
silencio si cambia la version de Prisma. Se prefirio correctitud simple sobre
optimizacion de tamano para cerrar la Fase 0.

**Costo:** la imagen final es mas pesada de lo necesario (incluye
herramientas de build y tipos que no se usan en runtime) y expone superficie
extra (mas paquetes instalados = mas superficie de dependencias en la imagen
que corre en produccion).

**Como resolverlo cuando se retome:**

- Opcion simple: mover `prisma` de `devDependencies` a `dependencies` en
  `apps/api/package.json` solo para poder correr `prisma generate` en un
  stage `prod-deps` con `pnpm install --prod`, y despues copiar unicamente
  ese `node_modules` a runtime.
- Opcion mas prolija: usar `pnpm deploy` (pensado exactamente para producir
  un directorio de despliegue self-contained por paquete de un workspace)
  corriendo `prisma generate` antes del deploy, para no depender de un ajuste
  manual en las dependencias declaradas.

**Prioridad:** baja mientras el proyecto no se despliegue a un ambiente con
restricciones de tamano/superficie de imagen. Referencia: `PHASE.md` Fase 0,
tarea 9 (Docker).
