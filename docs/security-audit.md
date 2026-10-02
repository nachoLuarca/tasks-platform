# Auditoria de seguridad de la API

Alcance: `apps/api` (rutas, middlewares, servicios, configuracion) y, donde la
API depende de ellos, `packages/contracts` y `apps/worker` (entrega de
webhooks). Metodo: revision de codigo de cada router y servicio, contrastada
con la matriz de permisos (`apps/api/src/shared/authorization/permissions.ts`)
y con la especificacion OpenAPI. No se ejecuto ninguna prueba contra un
despliegue real.

Escala de severidad:

- **Alta**: un usuario o atacante obtiene privilegios o acceso que el modelo no
  le da, o alcanza recursos internos.
- **Media**: debilita una defensa existente o expone el sistema segun como se
  despliegue; requiere condiciones adicionales.
- **Baja / Informativa**: endurecimiento, fuga menor o comportamiento a
  documentar. No se corrige en este PR.

## Resumen

| ID | Hallazgo | Severidad | Estado |
| --- | --- | --- | --- |
| SEC-01 | Una invitacion acepta el rol `OWNER` (escalada de privilegios) | Alta | Corregido |
| SEC-02 | Webhooks: URL de destino sin restricciones (SSRF) | Alta | Corregido |
| SEC-03 | CORS con `*` y `credentials: true` no se bloquea en produccion | Media | Corregido |
| SEC-04 | Sin `trust proxy`: el rate limit agrupa a todos los clientes en una IP | Media | Corregido |
| SEC-05 | Un `ADMIN` puede degradar o expulsar a otro `ADMIN` | Media | Corregido |
| SEC-06 | Login limitado solo por IP, sin limite por cuenta | Baja | Sin cambios |
| SEC-07 | `POST /v1/users/me/password` sin rate limit | Baja | Sin cambios |
| SEC-08 | El registro revela si un correo ya existe (409) | Baja | Sin cambios |
| SEC-09 | El log de login fallido guarda el correo | Baja | Sin cambios |
| SEC-10 | Respuestas de autenticacion sin `Cache-Control: no-store` | Baja | Sin cambios |
| SEC-11 | Parametros de ruta (`:token`, `:id`) sin validar su forma | Informativa | Sin cambios |
| SEC-12 | Access tokens validos hasta 15 min tras logout o reset de contrasena | Informativa | Aceptado (ADR 0011) |

Lo que se reviso y esta bien: ver "Controles verificados" al final.

## Hallazgos

### SEC-01 - Una invitacion acepta el rol `OWNER` (Alta)

`POST /v1/organizations/{id}/invitations` valida `role` con `roleSchema`, que
incluye `OWNER`, y `invitationsService.create` no lo rechaza: responde 201.
Al aceptar, `invitationsService.accept` crea la membresia con el rol
guardado. Resultado:

- La organizacion termina con dos `OWNER`, rompiendo la invariante de un unico
  propietario que `membersService.updateRole` si protege ("Use the
  transfer-ownership endpoint").
- Un `ADMIN` (que tiene `invitation:create`) puede invitar a una cuenta
  controlada por el mismo con rol `OWNER` y escalar a propietario, un rol
  superior al suyo. El propietario original no pierde nada y no hay
  `transfer-ownership` de por medio.

Comprobado en el codigo: ni el controlador ni el servicio comparan el rol
pedido con el del invitador. Las invitaciones `OWNER` que ya estuvieran
pendientes tambien se pueden aceptar hoy.

Correccion: `create` rechaza `OWNER` con 409 (mismo criterio y mensaje que
`updateRole`) y rechaza cualquier rol superior al del invitador; `accept`
tambien rechaza una invitacion `OWNER` ya existente. Cambia el contrato:
`POST .../invitations` pasa a documentar 409 tambien para este caso.

### SEC-02 - Webhooks: URL de destino sin restricciones, SSRF (Alta)

`createWebhookEndpointRequestSchema` solo exige `z.string().url()`. El worker
hace `fetch(endpoint.url)` desde dentro de la red del servicio, sigue
redirecciones y guarda el cuerpo de la respuesta (`responseSnippet`) y el
mensaje de error, que el propio `GET .../webhooks/{id}/deliveries` devuelve.
Un `ADMIN` (o el propietario) puede registrar `http://169.254.169.254/...`,
`http://localhost:...` o un host interno, disparar `POST .../test` y leer la
respuesta (SSRF con lectura), o escanear puertos internos por el mensaje de
error.

Correccion: la API rechaza con 422 las URLs que no son `http(s)`, que llevan
credenciales, o cuyo host es `localhost`, un nombre interno (`.local`,
`.internal`, `.localhost`) o una IP privada, de loopback, link-local o
reservada (IPv4 e IPv6). Solo se permite `http://` si
`WEBHOOK_ALLOW_PRIVATE_URLS=true`, variable pensada para desarrollo local. El
worker deja de seguir redirecciones (`redirect: 'manual'`), porque una
redireccion a una IP interna saltaria la validacion.

Riesgo residual (no cubierto): DNS rebinding, es decir, un nombre publico que
resuelve a una IP interna despues de validarse. Mitigarlo bien exige resolver
y fijar la IP en el momento de la entrega o aplicar reglas de egreso a nivel
de red; se recomienda lo segundo.

### SEC-03 - CORS con `*` y `credentials: true` en produccion (Media)

`resolveCorsOrigin()` devuelve `true` cuando `CORS_ORIGIN=*`, y el paquete
`cors` entonces refleja el `Origin` de cualquier sitio junto con
`Access-Control-Allow-Credentials: true`. `.env.example` dice que `*` "solo
es valido en development", pero nada lo impide. En produccion la cookie del
refresh token va con `SameSite=None` (`render.yaml`), de modo que una pagina
ajena podria llamar a `POST /v1/auth/refresh` con credenciales y leer el
access token de la respuesta. Requiere un despliegue mal configurado, de ahi
la severidad media.

Correccion: la configuracion falla al arrancar si `NODE_ENV=production` y
`CORS_ORIGIN` es `*` (o contiene `*`).

### SEC-04 - Sin `trust proxy`: rate limit y IP de sesion incorrectos (Media)

La API corre detras del proxy de Render (`render.yaml`) pero no configura
`trust proxy`. `req.ip` es entonces la IP del proxy para todos los clientes:

- El limitador de `register`, `login`, `refresh`, `forgot-password`, etc.
  (clave `ratelimit:{bucket}:{req.ip}`) comparte un unico contador entre todos
  los usuarios. Un atacante agota el cupo y bloquea el login de todos
  (denegacion de servicio), y el limite deja de proteger a una cuenta concreta.
- `RefreshToken.ipAddress` guarda la IP del proxy.

Correccion: nueva variable `TRUST_PROXY_HOPS` (entero, por defecto `0`, para
no fiarse de `X-Forwarded-For` cuando no hay proxy). `render.yaml` la fija en
`1`. La API aplica `app.set('trust proxy', n)` cuando es mayor que cero.

### SEC-05 - Un `ADMIN` puede degradar o expulsar a otro `ADMIN` (Media)

`PATCH` y `DELETE /v1/organizations/{id}/members/{userId}` solo comprueban
`member:update-role` / `member:remove`, que tiene todo `ADMIN`, y el servicio
solo protege al `OWNER`. Por tanto un `ADMIN` puede degradar a `VIEWER` o
expulsar a cualquier otro `ADMIN` (un par suyo), lo que le permite
monopolizar la administracion o dejar sin acceso a la competencia. El `OWNER`
es el unico que deberia gestionar a los administradores.

Respecto a "asignar o invitar a un rol superior al suyo": con el codigo
actual el unico rol superior alcanzable era `OWNER` por invitacion (SEC-01).
`PATCH members` ya rechaza `OWNER` y no existe otra via para asignar roles.
Un `ADMIN` puede asignar `ADMIN` (igual al suyo), que se mantiene.

Correccion: un rol que no sea `OWNER` no puede cambiar el rol ni expulsar a un
miembro de su mismo rango o superior (403). Se anade `canManageRole` junto a
la matriz de permisos.

### SEC-06 - Login limitado solo por IP (Baja)

`/login` tiene limite por IP (10 intentos por minuto por defecto, 503 si
Redis cae: correcto). No hay limite por cuenta, de modo que un ataque
distribuido contra un correo concreto no se frena. No se corrige aqui: un
bloqueo por cuenta permite a un tercero bloquear a la victima a voluntad y es
una decision de producto (retrasos progresivos, CAPTCHA). El tiempo de
respuesta ya es uniforme (`dummyPasswordHash`) y Argon2id encarece cada
intento.

### SEC-07 - Cambio de contrasena sin rate limit (Baja)

`POST /v1/users/me/password` verifica la contrasena actual sin limitador. Hace
falta un access token valido (15 min), y cada intento cuesta un Argon2id.
Recomendacion: anadir `createRateLimiter('change-password')`.

### SEC-08 - El registro revela si un correo existe (Baja)

`POST /v1/auth/register` responde 409 "Email is already registered". Permite
enumerar cuentas. Es el compromiso habitual de un registro con respuesta
inmediata; el resto de flujos (login, recuperacion) ya evitan la enumeracion.
El limite por IP lo frena parcialmente (y SEC-04 lo hace efectivo).

### SEC-09 - El log de login fallido guarda el correo (Baja)

`authService.login` registra `{ email }` con nivel `warn`. Es un dato personal
en los logs, y a veces la gente escribe su contrasena en el campo del correo.
Recomendacion: registrar un hash del correo o solo la IP.

### SEC-10 - Sin `Cache-Control: no-store` en respuestas de autenticacion (Baja)

Las respuestas de `login`, `register`, `refresh` y `GET /me` llevan tokens o
datos personales y helmet no anade `Cache-Control`. Los POST no suelen
cachearse; `GET /me` si podria. Recomendacion: `no-store` en `/v1/auth` y
`/v1/users`.

### SEC-11 - Parametros de ruta sin validar (Informativa)

Ninguna ruta valida `:id`, `:token`, `:taskId`, etc. Los identificadores son
texto en la base de datos, de modo que un valor mal formado da 404 y no 500, y
los tokens se comparan por hash. No hay inyeccion posible (Prisma
parametrizado; el unico SQL crudo usa plantillas etiquetadas). Los
`:token` de `GET /v1/invitations/:token` y `POST .../accept` tampoco tienen
rate limit; con 256 bits de entropia no es explotable.

Observacion no relacionada con seguridad: `taskListQuerySchema` usa
`z.coerce.boolean()` para `unassigned`, y `"false"` se convierte en `true`.

### SEC-12 - Access tokens vivos tras logout o reset (Informativa)

Los access tokens son JWT sin estado y siguen siendo validos hasta 15
minutos tras `logout-all` o un reset de contrasena. Ya esta decidido y
documentado en `docs/adr/0011-account-recovery.md`.

## Controles verificados (sin hallazgos)

- **Permisos e IDOR.** Toda ruta de `/v1/organizations/:organizationId/**`
  pasa por `requireMembership` (404 uniforme para no miembros) y despues por
  `requirePermission`. Los recursos hijos se resuelven siempre dentro del
  padre ya autorizado: `requireProject` (por organizacion), `requireTask`
  (por proyecto), `requireComment` (por tarea), `requireLabel`,
  `requireWebhook`, y la revocacion de API keys e invitaciones filtra por
  `organizationId`. Asignar una tarea exige que el destinatario sea miembro
  de la organizacion, y las etiquetas de una tarea se validan contra la
  organizacion.
- **API keys.** Una key solo vale para su organizacion, no puede gestionar
  invitaciones, miembros, webhooks ni otras keys, y quien crea una key debe
  tener todos los scopes que concede. Se almacena solo el hash.
- **Validacion de entrada.** Todos los endpoints con cuerpo o query usan
  `validateBody` / `validateQuery` con esquemas zod (longitudes maximas
  incluidas); el limite de cuerpo es 1 MB; JSON mal formado devuelve 400.
- **Rate limiting.** `register`, `login`, `refresh`, `verify-email`,
  `forgot-password`, `reset-password` y la comprobacion del token tienen
  limite en Redis, y la API devuelve 503 si Redis no responde en vez de dejar
  pasar. El reenvio de verificacion y los correos de recuperacion tienen
  limites por cuenta.
- **Datos sensibles.** `passwordHash` nunca sale en una respuesta; el secreto
  del webhook y la API key completa solo se devuelven al crearse. El logger
  elimina `authorization`, `cookie`, `req.body`, `password`, `token`,
  `secret`, etc., y las rutas con token en el path se enmascaran en el log y
  en el 404. La recuperacion de contrasena responde igual exista o no la
  cuenta.
- **Cabeceras.** `helmet()` con valores por defecto (CSP, HSTS,
  `X-Content-Type-Options`, `Referrer-Policy`...), `X-Powered-By` desactivado,
  cookie del refresh token `HttpOnly`, `Secure` en produccion y `SameSite`
  configurable. `/docs` funciona sin relajar la CSP.
