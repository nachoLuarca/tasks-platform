# 0009 — Outbox más cola, no una sola de las dos

## Contexto

La Fase 4 necesita que un cambio de dominio (una tarea que cambia de estado,
una que se crea, un comentario nuevo) termine, eventualmente, en un POST
firmado contra la URL de un webhook suscripto. `docs/adr/0008-activity-log.md`
ya dejó planteado el camino: cada fila de `TaskActivity` tiene la forma de un
evento publicable. Lo que faltaba resolver es cómo sacar ese evento del
proceso HTTP sin volver a abrir la ventana de inconsistencia que el ADR 0008
evitó para la bitácora — y, además, sin bloquear la petición del usuario con
reintentos de red hacia receptores que pueden estar caídos o ser lentos.

## Decisión

Dos capas, cada una resolviendo un problema distinto:

1. **Outbox (`OutboxEvent`), escrito en la misma transacción que
   `TaskActivity`** (`activityService.record`, `apps/api/src/modules/
   activity/activity.service.ts`). Esto garantiza que un evento **nunca se
   pierde**: si la transacción se revierte, ni la tarea cambió ni el evento
   existe; si la transacción confirma, ambos existen. Es la misma garantía
   del ADR 0008, extendida hacia afuera del proceso.

2. **Cola (BullMQ sobre Redis), consumida por el worker.** Un despachador
   (`apps/worker/src/dispatcher/outbox-dispatcher.ts`) hace polling del
   outbox con `SELECT ... FOR UPDATE SKIP LOCKED`, encuentra los
   `WebhookEndpoint` suscriptos a cada evento, y encola un trabajo de
   entrega por par (evento, endpoint). Esto garantiza los **reintentos con
   espera creciente** sin bloquear ninguna petición HTTP: la cola es quien
   sabe reintentar, no el endpoint que creó el evento.

`FOR UPDATE SKIP LOCKED` es lo que permite que varios despachadores (varias
réplicas del worker, o dos ejecuciones del mismo intervalo solapándose) no
procesen el mismo evento: una fila ya bloqueada por otra transacción queda
excluida en silencio del resultado de la segunda consulta, en vez de hacerla
esperar. Verificado en `test/integration/webhooks-and-api-keys.test.ts`
("two concurrent dispatches never claim the same outbox event"): dos
llamadas reales y concurrentes a `dispatchOutboxBatch` contra la misma tabla
con varios eventos pendientes, y la unión de lo que reclama cada una es el
total, sin solapamiento.

## Alternativas consideradas

- **Solo outbox, sin cola: el despachador entrega directamente.** Perdería
  los reintentos con espera creciente sin reinventar dentro del despachador
  la misma máquina de estados que BullMQ ya resuelve (backoff, límite de
  intentos, jobs fallidos consultables). Además, un receptor lento
  bloquearía el ciclo de despacho completo para el resto de los eventos
  pendientes.
- **Solo cola, sin outbox: encolar directamente desde el service, sin pasar
  por una tabla.** Reabre exactamente la ventana de inconsistencia que el
  ADR 0008 cerró para la bitácora: si el proceso cae entre confirmar la
  transacción de Postgres y encolar en Redis, o si encolar falla por
  cualquier razón, el cambio de dominio queda hecho pero el evento nunca
  sale. La tabla intermedia es lo que hace que "escribir el evento" sea
  parte de la misma transacción atómica que el cambio, algo que Redis no
  puede ofrecer por sí solo porque no comparte transacción con Postgres.
- **Un único proceso que hace de API y de worker.** Simplificaría el
  despliegue, pero mezclaría un componente que debe responder rápido
  (la API) con uno que hace polling y espera en reintentos (el worker),
  y PHASE.md pide explícitamente un proceso aparte que no compita por los
  mismos recursos ante una ráfaga de entregas fallidas.

## Consecuencias

- **Dos escrituras por cambio publicable, no una.** Cada operación que
  produce un evento hace, además del INSERT en `TaskActivity`, un INSERT en
  `OutboxEvent` dentro de la misma transacción — un costo de escritura
  adicional, ya aceptado en el ADR 0008 para el propio `TaskActivity`.
- **Ventana angosta entre marcar "despachado" y encolar en Redis.** Postgres
  y Redis no comparten transacción, así que hay un instante entre confirmar
  el `UPDATE` que marca `dispatchedAt` y el `queue.add(...)` posterior en el
  que, si el proceso muere ahí mismo, un evento puntual queda marcado como
  despachado sin haber llegado nunca a la cola. Se eligió este orden
  (marcar y después encolar) porque la alternativa —encolar y después
  marcar— duplicaría la entrega ante el mismo tipo de crash, y una entrega
  duplicada es más difícil de manejar para quien integra un webhook que una
  pérdida puntual y rara. Anotado en `docs/DEBT.md` con la mitigación futura
  (un barrido periódico de eventos despachados sin entregas).
- **El worker es indispensable para que algo salga.** Si el worker está
  caído, los eventos se acumulan en `OutboxEvent` sin error visible para
  quien usa la API (la petición HTTP original ya devolvió 2xx) — el
  monitoreo de "outbox pendiente hace más de X minutos" queda como trabajo
  operacional futuro, no de esta fase.
