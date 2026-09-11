# 0011 — Recuperacion de cuenta: respuesta uniforme, cierre total de sesiones y verificacion que no bloquea

## Contexto

La Fase 4.5 agrega verificacion de correo y recuperacion de contraseña. Las
dos giran alrededor de lo mismo: un token de un solo uso que viaja por correo
y prueba que quien lo presenta controla esa direccion. Tambien son dos de las
superficies mas atacadas de cualquier sistema con cuentas: una recuperacion
mal hecha es una forma de tomar una cuenta ajena, o de averiguar que
direcciones estan registradas.

Hay tres preguntas de diseño que PHASE.md responde como decisiones cerradas.
Este ADR deja escrito el por que de cada una, y como esta implementada.

## Decision 1: la solicitud de recuperacion responde igual exista o no la cuenta

### Que ataque previene

La **enumeracion de cuentas**. Si `POST /v1/auth/forgot-password` respondiera
`404 no existe esa cuenta` para un correo desconocido y `202` para uno real,
cualquiera podria recorrer una lista de direcciones y quedarse con las que
estan registradas. Eso sirve para:

- *Credential stuffing* dirigido: probar contraseñas filtradas de otros
  servicios solo contra las cuentas que existen, por debajo del radar del
  limite de intentos de login.
- *Phishing* creible: mandar un falso "restablece tu contraseña de Tasks
  Platform" solo a quien de verdad tiene cuenta.
- Revelar informacion en si misma: que una persona use cierto producto ya es
  un dato.

No alcanza con que el cuerpo sea igual. Si una rama tarda mas que la otra
(buscar el usuario, crear el token, encolar el correo), el tiempo de
respuesta filtra lo mismo que un mensaje distinto. Tampoco alcanza con un
limite de intentos por correo que responda `429`: un `429` que solo aparece
para correos registrados es otra forma de preguntar si existe la cuenta.

### Como se implementa

La API hace **exactamente el mismo trabajo** sea cual sea la direccion:
validar el cuerpo, aplicar el limite por IP y encolar un unico job
`password-reset-request` con el correo normalizado. **Nunca consulta la tabla
de usuarios** en esa peticion. Responde siempre `202` con un cuerpo constante
(`FORGOT_PASSWORD_RESPONSE`, en `password-reset.mapper.ts`).

Todo lo que depende de que la cuenta exista pasa en el worker, fuera de la
peticion: buscar la cuenta activa, contar cuantos tokens se emitieron en la
ultima hora, emitir el token y encolar el correo. Si no hay cuenta, o si la
cuenta ya alcanzo su limite (`PASSWORD_RESET_MAX_PER_HOUR`), el job termina en
silencio. Quien hizo la solicitud ya recibio su `202` y no puede distinguir
ninguno de esos casos.

Los dos limites quedan asi:

| Limite | Donde | Que pasa al superarlo |
|---|---|---|
| Por IP | API, `createRateLimiter('forgot-password')` | `429`, igual para cualquier correo |
| Por cuenta | Worker, cuenta de `PasswordResetToken` en la ultima hora | La solicitud se descarta sin avisar |

El test `password-reset.test.ts` lo verifica de tres formas: compara estado,
cabeceras y cuerpo entre un correo registrado y uno inexistente; comprueba
con espias que la peticion no busca el usuario y encola un job identico en
ambos casos; y mide medianas de tiempo intercaladas con una tolerancia menor
al costo del trabajo que se desplazo al worker.

### Alternativas consideradas

- **Hacer todo en la API y rellenar hasta un tiempo minimo.** Mas facil de
  seguir, pero agrega latencia a todas las solicitudes y falla justo cuando
  mas importa: si una rama supera el minimo bajo carga, la diferencia vuelve
  a aparecer.
- **Responder primero y hacer el trabajo en una promesa suelta dentro de la
  API.** El tiempo de respuesta queda uniforme, pero una caida del proceso
  pierde la solicitud sin reintento, y el trabajo compite por CPU con las
  peticiones siguientes, lo que puede volver a filtrar tiempos de forma
  indirecta.

Encolar siempre reutiliza la infraestructura que ya existe (BullMQ con
reintentos) y separa el trabajo por proceso, no solo por turno del event
loop.

## Decision 2: restablecer la contraseña revoca todas las sesiones; cambiarla no

### Por que la diferencia

Las dos operaciones cambian la contraseña, pero parten de situaciones
opuestas:

- **Cambio normal** (`POST /v1/users/me/password`): quien lo hace ya tiene una
  sesion valida y conoce la contraseña actual. Lo mas probable es que sea el
  dueño, desde su dispositivo. Se revocan las demas sesiones por precaucion,
  pero cerrar la suya propia solo lo obligaria a volver a entrar sin ganar
  nada.
- **Restablecimiento** (`POST /v1/auth/reset-password`): quien lo hace **no**
  conoce la contraseña, o dejo de confiar en ella. El caso tipico es "creo que
  me robaron la cuenta". Si alguna sesion sobreviviera, podria ser justamente
  la del atacante: cambiar la contraseña sin echarlo dejaria el problema
  intacto. No hay ninguna sesion en la que se pueda confiar, asi que se
  revocan todas, incluida la del navegador que pidio el restablecimiento
  (ademas se le borra la cookie).

### Como se implementa

En una sola transaccion: se consume el token (un `UPDATE` condicional, asi
dos usos concurrentes del mismo token no pueden ganar los dos), se reemplaza
el hash de la contraseña, se invalidan los demas tokens de recuperacion
pendientes de esa cuenta y se revocan todos sus refresh tokens. Si algo
falla, nada de eso ocurre y el token sigue sin usar.

El token se valida una vez antes de calcular el hash de Argon2id, que es
costoso a proposito. Asi un token inventado no obliga al servidor a calcular
un hash por peticion. La validacion que cuenta sigue siendo el consumo
atomico dentro de la transaccion.

### Limite conocido

Los access tokens son JWT sin estado de 15 minutos (ADR 0003). Revocar los
refresh tokens impide renovar cualquier sesion, pero un access token ya
emitido sigue siendo aceptado hasta que vence, como mucho 15 minutos. Cerrarlo
de inmediato requeriria consultar la base en cada peticion autenticada,
justamente lo que el diseño sin estado evita. Es el mismo limite que ya tiene
`POST /v1/auth/logout-all`. Queda anotado en `docs/DEBT.md`.

## Decision 3: la verificacion de correo no bloquea el acceso

### Es una decision, no un olvido

Un usuario con el correo sin verificar usa la API con total normalidad: crea
organizaciones, proyectos y tareas, acepta invitaciones y crea API keys.
Ningun middleware ni servicio consulta `emailVerifiedAt` para autorizar nada.
El estado solo se expone en `GET /v1/auth/me` para que un cliente pueda
mostrar un aviso.

Motivos:

- **Bloquear es una decision de producto, no de seguridad.** Que se pueda
  hacer sin verificar (nada, solo leer, todo salvo invitar a otros, ...) es
  una pregunta sobre la experiencia de uso que esta fase no tiene elementos
  para responder bien.
- **Romperia el usuario de demostracion de la Fase 7**, que tiene que poder
  entrar y usar todo sin pasar por un buzon de correo.
- **La verificacion no protege lo que parece proteger.** Lo que evita que
  alguien entre a una cuenta ajena es la contraseña y la recuperacion; la
  verificacion solo confirma que la direccion es de quien se registro. Eso
  importa para no mandar correos a quien no los pidio, no para autorizar
  acciones dentro de la API.

Para que siga siendo una decision y no se convierta en un accidente, el test
de registro en `email-verification.test.ts` comprueba que una cuenta sin
verificar crea un proyecto y una tarea. Si alguien agrega un bloqueo, ese
test falla y obliga a discutirlo.

### Aceptar una invitacion tambien verifica

El enlace de invitacion llego a esa direccion, y `invitationsService.accept`
ya exige que coincida con el correo de la cuenta. Eso prueba lo mismo que un
enlace de verificacion, asi que `emailVerifiedAt` se marca en la misma
transaccion que crea la membresia.

## Detalles comunes a los dos tokens

- **Opacos, hasheados, de un solo uso**, con el mismo patron que `Invitation`:
  256 bits aleatorios; en la base solo queda su SHA-256. Verificacion: 24
  horas. Recuperacion: 1 hora, porque el riesgo es mayor.
- **Un solo servicio los emite, valida y consume**
  (`packages/shared/src/account-tokens`), compartido por la API y el worker,
  para que las reglas no puedan divergir entre procesos.
- **Desconocido, usado y vencido responden igual** (`404` con el mismo
  detalle). Nadie tiene un motivo legitimo para distinguirlos.
- **El enlace apunta al cliente web, con el token en el fragmento**
  (`WEB_APP_URL/reset-password#token=...`). El fragmento nunca se envia a
  ningun servidor, ni aparece en logs de acceso ni en la cabecera `Referer`.
  Ademas, consumir un token exige un `POST` deliberado desde la pagina:
  un escaner de correo que abre los enlaces automaticamente no lo gasta.
- **El token nunca aparece en una respuesta ni en un log.** La unica ruta que
  lo lleva en el path por diseño (`GET /v1/auth/reset-password/:token`) queda
  enmascarada en el log de acceso, junto con las rutas de invitacion que
  tenian el mismo problema desde la Fase 2.
- **Los jobs que llevan un token vivo se borran de Redis al enviarse**
  (`ACCOUNT_EMAIL_JOB_OPTIONS`), en vez de quedar una semana guardados como los
  demas correos.

## Consecuencias

- Un fallo de Redis o del worker despues del `202` pierde la solicitud de
  recuperacion sin que el usuario lo sepa. Es aceptable: la accion natural es
  volver a pedirla, y la alternativa (avisar del fallo) volveria a separar
  las respuestas.
- El limite por cuenta solo protege a direcciones registradas. Las
  solicitudes a direcciones inexistentes solo tienen el limite por IP, pero
  no generan correos, asi que no hay a quien inundar.
- Verificar el correo no desbloquea nada, asi que un cliente que quiera un
  flujo "verifica para continuar" tiene que implementarlo del lado del
  producto, leyendo `emailVerifiedAt`.
