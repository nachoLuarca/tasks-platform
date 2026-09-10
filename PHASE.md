# Fase actual: 4 — Integración: webhooks, API keys y worker

**Objetivo:** que otros sistemas puedan hablar con este. Eventos salientes
firmados con reintentos, credenciales de máquina con alcance limitado, y un
worker que procesa todo fuera de la petición HTTP.

**Rama:** `feat/webhooks-and-api-keys`
**Tag al cerrar:** `v0.6.0`

Esta es la fase que distingue el proyecto. Un CRUD lo hace cualquiera; una
superficie de integración con entrega garantizada, firmas y reintentos es lo
que se pregunta en una entrevista.

---

## Decisiones ya tomadas

1. **Patrón outbox.** Cada evento que debe salir del sistema se escribe en una
   tabla `OutboxEvent` **en la misma transacción** que el cambio que lo
   produce, junto a la entrada de `TaskActivity`. Si la operación se revierte,
   el evento tampoco existe. Es la misma garantía del ADR 0008, extendida
   hacia afuera.

2. **Dos etapas, y cada una resuelve un problema distinto.** El outbox
   garantiza que ningún evento se pierda; la cola garantiza los reintentos con
   espera creciente. Un despachador en el worker lee el outbox con
   `FOR UPDATE SKIP LOCKED` y encola trabajos de entrega. `SKIP LOCKED` permite
   que varios despachadores corran en paralelo sin procesar el mismo evento.

3. **Firma al estilo Stripe.** Cabecera con marca de tiempo y HMAC-SHA256 sobre
   `timestamp + "." + cuerpo`. La marca de tiempo va dentro de lo firmado para
   que un atacante no pueda reenviar una entrega antigua. Tolerancia de 5
   minutos, documentada.

4. **El secreto del webhook se muestra una sola vez**, al crear el endpoint.
   Después no se puede recuperar, solo rotar.

5. **Reintentos con espera creciente:** hasta 5 intentos. Tras agotarlos, la
   entrega queda marcada como fallida y se registra. Un endpoint con 20
   fallos consecutivos se desactiva solo y queda anotado el motivo.

6. **Cada intento se registra**, con código de respuesta, duración y un
   fragmento del cuerpo devuelto. Sin ese registro, depurar una integración
   ajena es imposible.

7. **Las API keys pertenecen a la organización, no a un usuario.** Formato
   `tp_live_<aleatorio>`, guardada solo su hash. Se muestra completa una vez.
   Lleva un prefijo visible para poder identificarla en un listado sin
   revelarla.

8. **Los scopes de una API key son independientes de los roles.** Una key no
   "actúa como" un usuario: tiene su propia lista de permisos, subconjunto del
   vocabulario existente. Así una integración de solo lectura no puede borrar
   nada aunque quien la creó fuera `OWNER`.

9. **La bitácora distingue quién actuó.** `TaskActivity` pasa a tener actor de
   usuario o actor de API key, uno de los dos, nunca ambos ni ninguno.

10. **El enlace de invitación deja de devolverse en la respuesta.** Ahora se
    envía por correo a través del worker. Es la deuda que quedó anotada en la
    Fase 2.

11. **El worker es un proceso aparte**, en `apps/worker`, con su propio
    servicio en el compose. Comparte el modelo de datos y los contratos, pero
    no expone HTTP salvo un endpoint de salud.

---

## Alcance

### Modelo de datos
- [ ] `OutboxEvent`: id, organizationId, type, payload, createdAt,
      dispatchedAt, attempts
- [ ] `WebhookEndpoint`: id, organizationId, url, secret, eventTypes, enabled,
      disabledReason, consecutiveFailures, createdById, timestamps
- [ ] `WebhookDelivery`: id, endpointId, outboxEventId, attempt, statusCode,
      responseSnippet, error, durationMs, createdAt
- [ ] `ApiKey`: id, organizationId, name, prefix, keyHash, scopes, createdById,
      lastUsedAt, expiresAt, revokedAt, createdAt
- [ ] `TaskActivity` con actor de usuario o de API key
- [ ] Índices para el despachador: outbox pendiente por fecha

### Permisos nuevos
- [ ] `webhook:manage`, `apikey:manage` — solo `ADMIN` y `OWNER`

### Worker
- [ ] `apps/worker` deja de estar vacío: proceso con BullMQ sobre Redis
- [ ] Despachador que lee el outbox con `FOR UPDATE SKIP LOCKED` y encola
- [ ] Procesador de entregas de webhook con espera creciente
- [ ] Procesador de correos
- [ ] Apagado ordenado: termina lo que está procesando antes de salir
- [ ] Servicio `worker` en `docker-compose.yml`
- [ ] Endpoint de salud propio

### Webhooks
- [ ] `POST /v1/organizations/:organizationId/webhooks` — devuelve el secreto
      una sola vez
- [ ] `GET .../webhooks` — sin exponer secretos
- [ ] `PATCH .../webhooks/:webhookId`
- [ ] `DELETE .../webhooks/:webhookId`
- [ ] `POST .../webhooks/:webhookId/rotate-secret`
- [ ] `POST .../webhooks/:webhookId/test` — envía un evento de prueba
- [ ] `GET .../webhooks/:webhookId/deliveries` — paginado
- [ ] Eventos publicables derivados de los tipos de `TaskActivity`
- [ ] Suscripción selectiva: un endpoint elige qué eventos recibe

### API keys
- [ ] `POST /v1/organizations/:organizationId/api-keys` — devuelve la clave
      completa una sola vez
- [ ] `GET .../api-keys` — con prefijo, scopes, último uso
- [ ] `DELETE .../api-keys/:apiKeyId` — revocar
- [ ] Middleware que autentica por API key cuando la credencial empieza con el
      prefijo, y por JWT en caso contrario
- [ ] Los scopes se verifican contra el mismo vocabulario de permisos
- [ ] Se actualiza `lastUsedAt`, sin escribir en cada petición si se puede
      evitar

### Correo
- [ ] Envío real de la invitación a través del worker, contra Mailpit en
      desarrollo
- [ ] Plantilla en texto plano y HTML
- [ ] El endpoint de invitación ya no devuelve el enlace

### Tests
- [ ] Un evento no llega al outbox si la transacción se revierte
- [ ] La firma generada se valida correctamente y falla si se altera el cuerpo
- [ ] Una entrega antigua reenviada es rechazada por la marca de tiempo
- [ ] Un endpoint que responde 500 se reintenta y se registra cada intento
- [ ] Tras 20 fallos consecutivos el endpoint queda desactivado
- [ ] Un endpoint solo recibe los eventos a los que está suscrito
- [ ] Dos despachadores en paralelo no procesan el mismo evento
- [ ] Autenticación con API key válida, revocada y vencida
- [ ] Una key sin el scope necesario recibe 403
- [ ] La clave completa no aparece en ninguna respuesta posterior a su creación
- [ ] El correo de invitación llega a Mailpit y contiene el enlace correcto
- [ ] El secreto del webhook no aparece en ningún listado

### Documentación
- [ ] `docs/adr/0009-outbox-pattern.md`
- [ ] `docs/adr/0010-webhook-signing.md`
- [ ] README con la guía de integración: cómo verificar una firma, con ejemplo
      de código en Node y en PHP
- [ ] `docs/DEBT.md` — quitar lo del enlace de invitación, ya resuelto

---

## Fuera de alcance

- Verificación de correo y recuperación de contraseña (Fase 4.5)
- Webhooks entrantes desde sistemas externos
- OAuth para aplicaciones de terceros
- Límites de uso por API key
- Reintento manual de una entrega fallida desde la API
- Cifrado del secreto del webhook en reposo: anotar en `docs/DEBT.md` para la
  Fase 6, cuando exista un gestor de secretos

---

## Criterio de cierre

1. Sin archivo `.env`, con el stack levantado:
   `pnpm install && pnpm test && pnpm typecheck && pnpm lint` pasa entero
2. `docker compose up -d --build` deja los **cinco** servicios `healthy`,
   incluido `worker`
3. Los dos checks del CI en verde en el Pull Request
4. Recorrido manual: crear un webhook apuntando a un receptor local, cambiar el
   estado de una tarea, ver la entrega registrada con su firma; crear una API
   key de solo lectura y comprobar que puede listar tareas pero no crearlas;
   invitar a alguien y ver el correo en Mailpit en `localhost:8025`
5. Un evento producido por una transacción revertida nunca se entrega

Cumplido eso: Pull Request, checks verdes, merge con commit de merge, y tag
`v0.6.0`.
