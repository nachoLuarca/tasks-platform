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

## `pnpm install` descarga los binarios de esbuild para todas las plataformas

**Donde:** `pnpm-lock.yaml`, resolucion de `esbuild` (dependencia transitiva de
`tsx` y `vitest` en `apps/api`).

**Que pasa:** al no haber `supportedArchitectures` configurado, pnpm resuelve
el paquete `@esbuild/<plataforma>` de todas las plataformas que esbuild
soporta (Linux, macOS, Windows, BSD, Android, distintas arquitecturas), no
solo la del entorno donde corre el install, aunque en tiempo de ejecucion solo
se usa el binario nativo de la plataforma actual.

**Costo:** instalaciones mas lentas y una carpeta `.pnpm` mas pesada de lo
necesario, tanto en desarrollo local como en CI.

**Como resolverlo cuando se retome:** declarar `supportedArchitectures` en
`pnpm-workspace.yaml` (o en un `.npmrc`), acotado a las plataformas realmente
usadas (Linux x64 para Docker y CI, mas la plataforma de desarrollo local).

**Prioridad:** baja, es un costo de tiempo/espacio en la instalacion, no un
problema de correctitud.

## Prisma tiene una version mayor disponible

**Donde:** `apps/api/package.json` (`prisma`, `@prisma/client`).

**Que pasa:** `prisma generate` avisa en cada corrida que hay una version
mayor disponible (la 8.x, en release candidate al momento de escribir esto).
El proyecto sigue en la serie 6.x.

**Costo:** ninguno inmediato, la version actual funciona y esta soportada. El
costo es quedar cada vez mas lejos de la version vigente y terminar
absorbiendo una migracion mayor de una sola vez.

**Como resolverlo cuando se retome:** cuando la version mayor salga estable
(no RC), revisar su changelog y actualizar `prisma` y `@prisma/client` juntos
en el mismo commit, corriendo la suite de tests completa despues.

**Prioridad:** baja, no bloquea nada hoy.
