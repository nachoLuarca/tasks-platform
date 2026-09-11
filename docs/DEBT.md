# Deuda tecnica

Registro de atajos deliberados que quedaron documentados a proposito, para no
perderlos de vista. Cuando se resuelva un punto, se borra de aca (el `git log`
del commit que lo resuelve es la referencia historica).

## Los contenedores de desarrollo pueden reinstalar dependencias al arrancar

**Donde:** `docker/api.Dockerfile` y `docker/worker.Dockerfile`, stage `dev`.

**Que pasa:** al arrancar, `pnpm run dev`/`dev:worker` ejecuta la
verificacion automatica de pnpm ("deps status check") que compara el
`pnpm-lock.yaml` montado desde el host contra el estado de `node_modules`
del contenedor. Si detecta cualquier diferencia, purga y reinstala **todas**
las dependencias del workspace desde el registro, dentro del contenedor, en
vez de arrancar directo. Con una red lenta o inestable esto puede demorar
varios minutos o, si una descarga puntual falla de forma persistente,
terminar el proceso con error (el contenedor queda `Exited`).

**Por que se hizo asi:** `user: "1000:1000"` en `docker-compose.yml` corre el
proceso como el usuario del host (para que los archivos que el hot-reload
toca queden con su dueño, no con el de root), pero `node_modules` se arma
como root durante el build de la imagen; `CI=true` y un `chmod -R a+rwX`
sobre `node_modules` (agregados para resolver esta fase) evitan que la
purga aborte por falta de TTY o por permisos, pero no evitan que la purga
*ocurra* cuando pnpm decide que hay que reinstalar.

**Costo:** un `docker compose up` puede tardar bastante mas de lo esperado
la primera vez que arranca despues de `docker compose down`/`--force-recreate
-V`, o fallar de forma intermitente si la descarga de un paquete puntual
falla durante la reinstalacion (visto en esta misma fase: un timeout
descargando el motor de Prisma tumbo el contenedor `api` una vez; un
`docker compose up -d api` posterior lo resolvio sin cambiar nada de
codigo).

**Como resolverlo cuando se retome:** investigar por que la verificacion de
pnpm considera desactualizado un `node_modules` que en teoria coincide con
el lockfile recien horneado en la imagen (sospecha: el archivo marcador que
pnpm usa para esa comparacion vive dentro de `node_modules`, que es un
volumen anonimo separado del bind mount del codigo fuente, y algo en ese
volumen queda inconsistente entre builds). Una alternativa mas simple:
agregar una politica de `restart: on-failure` a `api` y `worker` en
`docker-compose.yml` para que un fallo de red puntual durante la
reinstalacion se resuelva solo con un reintento, sin intervencion manual.

**Prioridad:** media -- no bloquea un `docker compose up` con red estable,
pero es una fuente de arranques lentos o fallidos intermitentes en entornos
con conectividad restringida.

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

## Un access token sigue valido hasta 15 minutos despues de restablecer la contraseña

**Donde:** `apps/api/src/modules/auth/require-auth.middleware.ts` y
`apps/api/src/modules/password-reset/password-reset.service.ts`.

**Que pasa:** restablecer la contraseña revoca todos los refresh tokens de la
cuenta, pero los access tokens (JWT de 15 minutos) ya emitidos se siguen
aceptando hasta que vencen. Un atacante con una sesion robada pierde la
posibilidad de renovarla, pero conserva el access token que tenga en mano
durante, como mucho, 15 minutos.

**Por que se hizo asi:** los access tokens son sin estado a proposito (ADR
0003): se validan sin consultar la base. Cortarlos de inmediato requiere una
consulta por peticion autenticada. `POST /v1/auth/logout-all` ya tenia este
mismo limite desde la Fase 1.

**Costo:** hasta 15 minutos de acceso residual para una sesion comprometida
tras un restablecimiento.

**Como resolverlo cuando se retome:** agregar `User.sessionsValidAfter`,
fijarlo al restablecer (y en `logout-all`), y rechazar en `requireAuth` todo
JWT con `iat` anterior, con una cache corta en Redis por usuario para no
consultar Postgres en cada peticion.

**Prioridad:** media.

## Los scopes de una API key no se revalidan si quien la creo pierde permisos

**Donde:** `apps/api/src/modules/api-keys/api-keys.service.ts` (`create`).

**Que pasa:** que quien crea la key tenga cada scope se comprueba solo al
crearla. Si despues se degrada o se expulsa a esa persona, la key conserva
sus scopes, porque pertenece a la organizacion y no a un usuario (decision de
la Fase 4). Un `ADMIN` degradado a `MEMBER` que guardo la clave sigue
pudiendo, por ejemplo, editar cualquier tarea a traves de ella.

**Por que se hizo asi:** PHASE.md pide validar al crear, y deja fuera de
alcance la rotacion de keys. Revocar keys en cascada al cambiar un rol es una
decision de producto que no estaba tomada.

**Costo:** una via de acceso residual para alguien que perdio privilegios,
hasta que un `ADMIN`/`OWNER` revoque la key a mano.

**Como resolverlo cuando se retome:** al degradar o expulsar a un miembro,
revocar (o al menos listar para revision) las keys que creo con scopes que su
nuevo rol ya no tiene. El vinculo `ApiKey.createdById` ya existe.

**Prioridad:** media.

## El enlace de invitacion todavia lleva el token en el path de la API

**Donde:** `apps/api/src/modules/invitations/invitations.service.ts`
(`acceptUrl`).

**Que pasa:** los enlaces de verificacion y de recuperacion apuntan al
cliente web con el token en el fragmento, que nunca llega a un servidor. El
de invitacion sigue apuntando a `APP_PUBLIC_URL/v1/invitations/<token>`. El
log de acceso de la API ya enmascara ese segmento (Fase 4.5), pero un proxy
intermedio o una cabecera `Referer` todavia pueden verlo.

**Por que se hizo asi:** cambiar el formato del enlace de invitacion no
estaba en el alcance de la Fase 4.5, y todavia no existe el cliente web que
recibiria el fragmento.

**Costo:** exposicion del token de invitacion en infraestructura intermedia.
El impacto es limitado: aceptar exige una sesion cuyo correo coincida con el
invitado.

**Como resolverlo cuando se retome:** cuando exista el cliente web (Fase 7),
generar el enlace con `buildAccountTokenLink`, o una variante para
invitaciones, y un `POST` desde la pagina.

**Prioridad:** baja.

## El limite de reenvios de verificacion no es atomico

**Donde:** `apps/api/src/modules/email-verification/email-verification.service.ts`
(`resend`).

**Que pasa:** el limite cuenta los tokens emitidos en la ultima hora y
despues emite uno nuevo, en dos pasos. Varias peticiones simultaneas de la
misma cuenta pueden pasar el conteo antes de que ninguna inserte, y superar
el limite por una o dos.

**Por que se hizo asi:** contar las filas reales evita estado extra en Redis y
funciona igual con varias instancias. El desvio posible es minimo y exige una
sesion valida de esa misma cuenta.

**Costo:** algun correo de verificacion de mas en una rafaga concurrente.

**Como resolverlo cuando se retome:** un bloqueo consultivo por usuario
(`pg_advisory_xact_lock`) alrededor de contar y emitir, o un contador atomico
en Redis.

**Prioridad:** baja.

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
