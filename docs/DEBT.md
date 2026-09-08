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

## El secreto del webhook se guarda en texto plano

**Donde:** columna `WebhookEndpoint.secret` (`apps/api/prisma/schema.prisma`).

**Que pasa:** el secreto usado para firmar cada entrega (HMAC-SHA256) se
guarda sin cifrar en la base. No es un token opaco verificable por hash como
el refresh token o el de invitacion: el worker necesita el valor real para
firmar cada entrega futura, asi que un hash de un solo sentido no sirve aca.

**Por que se hizo asi:** cifrar en reposo requiere un gestor de secretos
(KMS, Vault, o equivalente) que todavia no existe en el proyecto. PHASE.md
lo deja explicitamente fuera de alcance de esta fase y pide anotarlo aca.

**Costo:** quien tenga acceso de lectura a la base de datos de produccion
puede leer el secreto de cualquier webhook y falsificar entregas firmadas
en su nombre.

**Como resolverlo cuando se retome:** cuando exista un gestor de secretos
(Fase 6 en el roadmap actual), cifrar `secret` en reposo (por ejemplo con
envelope encryption) y descifrar solo en el momento de firmar, dentro del
worker.

**Prioridad:** media-alta antes de manejar webhooks de organizaciones reales;
sin impacto mientras el proyecto no se despliegue con datos de produccion.

## El despachador marca un evento como despachado antes de encolarlo

**Donde:** `apps/worker/src/dispatcher/outbox-dispatcher.ts`
(`dispatchOutboxBatch`).

**Que pasa:** la transaccion que reclama eventos pendientes (`FOR UPDATE
SKIP LOCKED`) marca `dispatchedAt` y confirma en Postgres; recien despues,
ya fuera de esa transaccion, se encola el trabajo de entrega en BullMQ
(Redis). Si el proceso muere exactamente en esa ventana, el evento queda
marcado como despachado pero nunca llega a encolarse: no se entrega nunca,
y el despachador no vuelve a intentarlo porque ya no esta "pendiente".

**Por que se hizo asi:** Postgres y Redis son dos almacenes distintos; no
hay una transaccion que abarque ambos. Marcar como despachado *despues* de
encolar tiene el problema inverso (un crash entre encolar y marcar duplica
la entrega); se eligio el orden que prioriza "nunca se entrega dos veces"
sobre "siempre se entrega al menos una vez", ya que las entregas duplicadas
son mas dificiles de razonar para quien integra un webhook que una perdida
puntual y rara.

**Costo:** en el caso extremadamente improbable de que el proceso del worker
muera en esa ventana especifica, ese evento puntual no se entrega nunca, sin
ningun reintento posterior.

**Como resolverlo cuando se retome:** un barrido periodico que busque
eventos con `dispatchedAt` antiguo (por ejemplo, mas de N minutos) y sin
ninguna `WebhookDelivery` asociada, y los vuelva a encolar.

**Prioridad:** baja: la ventana de riesgo es de milisegundos y requiere un
crash exactamente ahi, no un fallo de red comun (esos ya estan cubiertos por
los reintentos de BullMQ).

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
