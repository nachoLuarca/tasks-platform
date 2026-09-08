# 0007 — Bloqueo optimista con `version` en el cuerpo, no `If-Match`

## Contexto

Una tarea puede estar abierta en la pantalla de dos personas a la vez. Si
ambas la editan y la segunda escritura simplemente sobrescribe a la primera
sin que nadie se entere, se pierde trabajo en silencio. La Fase 3 necesita
que `PATCH .../tasks/:taskId` detecte ese choque y lo rechace en vez de
aplicarlo.

La técnica es bloqueo optimista: la fila lleva un contador `version` que
sube en cada modificación, y toda actualización debe declarar la versión que
leyó. Si ya no coincide con la de la base, alguien más escribió primero:
la respuesta es 409 y quien llama tiene que releer y reintentar. Lo que
PHASE.md no cerraba de antemano es *dónde* viaja esa versión en la petición:
en el cuerpo (`{ "version": 3, ... }`) o en una cabecera HTTP estándar
(`If-Match: "3"`, la mecánica de ETags condicionales).

## Decisión

`version` viaja como un campo obligatorio dentro del cuerpo de
`PATCH .../tasks/:taskId` (`packages/contracts/src/tasks.schema.ts`,
`updateTaskRequestSchema`). La comprobación y el incremento ocurren en una
sola sentencia `UPDATE ... WHERE id = ? AND version = ?` (`tasksRepository.
updateWithVersion`): si la sentencia afecta cero filas, la versión ya no es
la vigente (o la tarea no existe) y el servicio devuelve 409.

## Alternativas consideradas

- **Cabecera `If-Match` con ETags condicionales (RFC 9110).** Es el
  mecanismo HTTP estándar para esto, y tiene la ventaja de que `GET`
  devuelve un `ETag` que el cliente reenvía sin tener que extraerlo del
  cuerpo del recurso. Se descartó por dos razones: primero, requiere que el
  cliente maneje cabeceras condicionales además del cuerpo JSON normal, algo
  que el resto de esta API no le pide en ningún otro endpoint (rompe la
  consistencia de la superficie); segundo, un valor en el cuerpo es
  igual de verificable y bastante más simple de generar y depurar con
  herramientas comunes (`curl -d`, cualquier cliente HTTP básico) que
  construir una cabecera con el formato de ETag correcto (comillas, débil
  vs. fuerte). Dado que ningún otro endpoint de la API usa condicionales
  HTTP, introducir uno solo para tareas hubiera sido una excepción sin
  compañía.
- **Sin control de versión, "el último que escribe gana".** Es lo que ya
  pasaba antes de esta fase (no había edición concurrente posible porque no
  había recurso compartido editable). Para tareas, que sí se editan desde
  varios lados, perder cambios en silencio es exactamente el problema que
  esta decisión evita.
- **Bloqueo pesimista (`SELECT ... FOR UPDATE` mientras se edita).**
  Requeriría mantener una transacción abierta durante todo el tiempo que
  alguien tiene el formulario de edición abierto en el cliente, lo cual no
  es viable sobre HTTP sin estado: no hay una conexión persistente que
  sostenga el lock entre el `GET` y el `PATCH` posterior.

## Consecuencias

- El cliente debe guardar el `version` que vino en la última respuesta y
  reenviarlo en cada `PATCH`; si no lo hace, Zod rechaza la petición con 400
  antes de llegar al servicio (`version` es obligatorio en el esquema).
- Un 409 no dice qué cambió, solo que algo cambió: el cliente debe volver a
  pedir el recurso (`GET`) para ver la versión actual antes de reintentar.
  No hay fusión automática de cambios en esta fase.
- `assign`/`unassign` (`POST .../tasks/:taskId/assign` y `/unassign`) también
  incrementan `version` porque son una escritura más sobre la tarea, pero no
  exigen enviarla: son acciones de un solo campo, no una edición general del
  recurso, y PHASE.md solo pide la comprobación de versión para "actualizar"
  (`PATCH`). Quien vuelve a leer la tarea después de asignarla ve el
  `version` nuevo y lo usa en su próximo `PATCH`.
