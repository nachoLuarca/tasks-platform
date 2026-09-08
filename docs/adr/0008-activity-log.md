# 0008 — La bitácora se escribe en la misma transacción que el cambio

## Contexto

`TaskActivity` registra la creación de una tarea, los cambios de estado,
prioridad, responsable, fecha de vencimiento, título y etiquetas, y los
comentarios nuevos. PHASE.md exige que sea de solo lectura -- no hay ningún
endpoint que la escriba directamente -- y decide de antemano que la escritura
"ocurre en la MISMA transacción que el cambio: si la operación se revierte,
no queda entrada". Lo que no cerraba de antemano es *cómo* garantizar eso en
código: qué evita que un desarrollador, en un módulo futuro, escriba primero
la tarea y la entrada de bitácora después, en dos pasos sueltos que pueden
divergir si el segundo falla.

## Decisión

`activityService.record(entry, client)` (`apps/api/src/modules/activity/
activity.service.ts`) exige explícitamente el `client` de la transacción
como parámetro -- no tiene una sobrecarga que use el `prisma` global por
defecto, a diferencia de la mayoría de los métodos de lectura del resto del
código. Cada operación que produce un evento (`tasksService.create`,
`tasksService.update`, `tasksService.assign`/`unassign`, `labelsService.
setTaskLabels`, `commentsService.create`) abre su propio `prisma.
$transaction(...)` y pasa ese mismo `tx` tanto a su propio repositorio como a
`activityService.record`. Si cualquier paso de esa transacción falla --
incluido el propio `record`-- Postgres revierte todo el bloque: la tarea no
cambia y la entrada de bitácora tampoco existe.

El caso que más lo ejercita es el 409 de bloqueo optimista
(`docs/adr/0007-optimistic-locking.md`): `updateWithVersion` hace un solo
`UPDATE ... WHERE id = ? AND version = ?`. Si la versión ya no coincide,
la sentencia afecta cero filas, el servicio lanza `ConflictError` dentro del
mismo bloque `$transaction`, y la transacción se revierte antes de que se
calcule siquiera el diff de campos que alimentaría la bitácora. El test
`test/integration/comments-labels-activity.test.ts` ("a rejected update...
leaves no trace") ejercita exactamente este camino contra Postgres real, sin
mocks: hace un `PATCH` válido, reintenta con la misma versión ya consumida,
confirma el 409, y verifica que el conteo de entradas de bitácora no creció.

## Alternativas consideradas

- **Escribir la bitácora después de confirmar el cambio, en una llamada
  separada.** Es el diseño más simple de leer línea por línea, pero abre una
  ventana entre las dos escrituras: si el proceso cae, o la segunda llamada
  falla por cualquier razón (una constraint, una desconexión), la tarea
  queda modificada sin que quede registro de qué pasó -- justo el escenario
  que PHASE.md prohíbe explícitamente.
- **Un trigger de base de datos sobre `Task`/`Comment`/`TaskLabel` que
  inserte en `TaskActivity` automáticamente.** Garantizaría la atomicidad a
  nivel de motor, sin depender de que cada service recuerde llamar a
  `activityService.record`. Se descartó por la misma razón que
  `docs/adr/0005-permission-matrix.md` mantiene la matriz de permisos en
  código y no en la base: la lógica de negocio (qué constituye un "cambio"
  relevante, el mensaje `before`/`after`, qué campos se ignoran) quedaría
  fuera del control de versiones de TypeScript, sin tipado ni tests directos
  contra ella, y sería más difícil de razonar junto al resto del dominio.
- **Cola de eventos asíncrona (publicar el cambio, un consumidor separado
  escribe la bitácora).** Es, de hecho, la forma en que los webhooks de la
  Fase 4 van a consumir estos mismos eventos -- pero para la bitácora *en
  sí* introduciría la misma ventana de inconsistencia que la primera
  alternativa: el consumidor podría no llegar a procesar el evento nunca,
  dejando el registro incompleto sin que hubiera ningún error visible en la
  petición original.

## Consecuencias

- **Acoplamiento en la ruta de escritura.** `tasksService`, `commentsService`
  y `labelsService` ahora conocen `activityService` y abren su propia
  transacción para envolver tanto su propio repositorio como el de
  actividad. Antes de esta fase, `tasksRepository.createWithNextNumber`
  abría su transacción internamente; ahora la abre `tasksService.create`,
  para que la entrada `TASK_CREATED` quede dentro del mismo bloque -- un
  repositorio ya no decide por su cuenta dónde empieza y termina la unidad
  de trabajo cuando esa unidad cruza a otro módulo.
- **Costo en la ruta de escritura.** Cada operación que antes era una sola
  sentencia (o una transacción de un solo repositorio) ahora hace, como
  mínimo, una escritura adicional a `TaskActivity` dentro de la misma
  transacción. Es un INSERT más por operación, no una consulta extra en
  lectura -- los listados de tareas y comentarios no se ven afectados, y
  ambos siguen resolviendo en un número constante de consultas
  (`test/integration/tasks.test.ts` "listing query efficiency",
  `test/integration/comments-labels-activity.test.ts` "lists comments...").
- **Camino directo hacia los webhooks de la Fase 4.** Cada fila de
  `TaskActivity` ya tiene la forma de un evento publicable: `type` es
  virtualmente el nombre del evento (`TASK_CREATED`, `STATUS_CHANGED`, ...),
  `changes` es el payload (`{ before, after }`), y `actorId`/`taskId`/
  `createdAt` son los metadatos que cualquier entrega de webhook necesita.
  Cuando la Fase 4 agregue una cola de salida, el candidato más simple es
  publicar cada fila nueva de `TaskActivity` como un evento saliente en la
  misma transacción en la que ya se escribe hoy (vía un outbox, para no
  volver a abrir la ventana de inconsistencia que esta decisión evita) en
  vez de duplicar la lógica de "qué cambió" en un segundo lugar.
