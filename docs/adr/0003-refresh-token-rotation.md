# 0003 — Rotacion de refresh token con deteccion de reuso

## Contexto

La Fase 1 necesita mantener la sesion de un usuario mas alla de los 15
minutos de vida del access token, sin obligarlo a volver a escribir su
contraseña cada vez que ese token expira. La forma estandar de resolver esto
es un refresh token de vida larga (30 dias en este proyecto) que el cliente
guarda y usa para pedir un access token nuevo.

Un refresh token de larga vida es, en si mismo, una credencial de alto valor:
si se filtra (log accidental, XSS que lee `localStorage`, un dispositivo
perdido), un atacante puede mantener acceso indefinidamente sin volver a
necesitar la contraseña.

## Decision

El refresh token se rota en cada uso, con deteccion de reuso:

- Es un valor opaco (256 bits aleatorios), no un JWT: no hay nada que
  decodificar ni verificar sin ir a la base, lo que permite revocarlo de
  verdad (un JWT firmado sigue siendo valido hasta que expira, se pueda o no
  "revocar" en la practica).
- En la base solo se guarda su hash SHA-256, nunca el valor. Un volcado de la
  tabla no permite reconstruir tokens usables.
- Cada vez que se usa `POST /v1/auth/refresh`, ese token se marca revocado y
  se emite uno nuevo dentro de la misma "familia" (`familyId`), enlazado via
  `replacedById`. El cliente legitimo, que siempre usa el ultimo token que
  recibio, nunca nota la rotacion.
- Si se presenta un token que ya estaba revocado, eso solo puede significar
  una de dos cosas: alguien mas ya lo uso (un atacante con una copia robada),
  o el dueño legitimo esta reutilizando una copia vieja por error. En ambos
  casos, la respuesta correcta es la misma: no se puede distinguir de forma
  confiable cual de los dos paso, asi que se revoca **toda la familia** y se
  registra el evento. El usuario legitimo simplemente tiene que volver a
  iniciar sesion; el atacante pierde el acceso que tenia.
- Viaja en una cookie `httpOnly` (no accesible desde JavaScript, mitiga XSS),
  `secure` en produccion y con `sameSite` configurable, en vez de ir en el
  cuerpo de la respuesta o guardarse en `localStorage`.

## Alternativas consideradas

- **Refresh token de larga vida sin rotacion.** Mas simple de implementar,
  pero un token filtrado sigue siendo valido hasta que expire (30 dias) o el
  usuario cierre sesion manualmente en todos los dispositivos. No hay forma
  de saber que fue comprometido.
- **Rotacion sin deteccion de reuso.** Rotar en cada uso ya reduce la ventana
  de exposicion de cada token individual a un solo uso, pero sin la regla de
  "revocar toda la familia al detectar reuso", un atacante que roba un token
  y lo usa antes que el dueño legitimo simplemente le "roba el turno": el
  dueño legitimo se queda afuera sin que nadie se entere de que hubo un
  robo.
- **JWT de larga vida como refresh token.** Evita el viaje a la base para
  verificarlo, pero por eso mismo no se puede revocar antes de que expire:
  justo la propiedad que se necesita para poder reaccionar a un robo.

## Consecuencias

- Cada refresh consume una fila y crea otra: la tabla `RefreshToken` crece
  con el uso normal. Limpiar filas revocadas/expiradas viejas es trabajo de
  mantenimiento futuro (no en el alcance de esta fase).
- Si el cliente pierde la respuesta de un refresh exitoso por un problema de
  red (recibe el nuevo token pero la conexion se corta antes de guardarlo) y
  reintenta con el token viejo, el sistema lo trata igual que un robo y cierra
  toda la sesion. Es un trade-off deliberado: preferir cerrar sesion de mas
  ante la ambiguedad, antes que arriesgarse a no detectar un robo real.
- Detectar el reuso no dice quien fue: el atacante o el propio usuario en
  una carrera de red. El log solo registra la sospecha para poder
  investigarla despues; no se notifica al usuario en esta fase.
