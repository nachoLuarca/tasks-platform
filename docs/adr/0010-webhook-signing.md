# 0010 — Firma de webhooks al estilo Stripe

## Contexto

Un webhook es un POST a una URL que el dueño de la organización eligió, sin
ningún control sobre quién más puede estar escuchando en esa URL o
interceptando el tráfico hacia ella. Quien recibe la entrega necesita una
forma barata de verificar dos cosas: que el cuerpo realmente lo generó Tasks
Platform (no un tercero suplantándolo) y que esa entrega en particular no es
una copia de una entrega vieja, reenviada más tarde por alguien que la
capturó.

## Decisión

HMAC-SHA256 sobre `"${timestamp}.${body}"`, donde `timestamp` son segundos
Unix y `body` es el JSON serializado exacto que se envía. El resultado viaja
en una cabecera `X-Webhook-Signature: t=<timestamp>,v1=<hmac-hex>`
(`packages/shared/src/security/webhook-signature.ts`).

El punto central: **el timestamp forma parte de lo firmado, no viaja al
lado.** Si solo viajara como metadato sin firmar, un atacante que capturó
una entrega antigua (cuerpo + firma) podría reenviarla más tarde con un
timestamp falso más reciente y la firma seguiría siendo válida — el
timestamp firmado es lo que hace que alterarlo invalide la firma, cerrando
ese ataque de repetición.

`verifyWebhookSignature` rechaza una firma cuyo timestamp está a más de
`WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` (300 segundos = 5 minutos, configurable)
del reloj de quien verifica. Cinco minutos es suficiente margen para relojes
razonablemente sincronizados y latencia de red normal, sin dejar una ventana
tan amplia como para que una entrega capturada siga siendo reproducible
minutos después con margen cómodo.

La comparación de la firma calculada contra la recibida usa
`timingSafeEqual`, no `===`: comparar cadena por cadena con un operador
normal deja de recorrer el string en cuanto encuentra el primer byte
distinto, lo que en teoría permite inferir la firma correcta byte a byte
midiendo cuánto tarda cada intento (un ataque de temporización). No es un
riesgo real para el timestamp en sí, pero sí lo es para la porción `v1`
(el HMAC), que es exactamente el secreto que esta firma protege.

## Alternativas consideradas

- **Cabecera separada para el timestamp** (p. ej. `X-Webhook-Timestamp` +
  `X-Webhook-Signature` sin el timestamp dentro de lo firmado). Es más
  simple de leer para quien integra, pero deja el timestamp fuera de la
  firma: nada impide alterarlo sin invalidar la firma, así que no protege
  contra reenvíos.
- **mTLS o un secreto compartido por cabecera simple, sin HMAC.** mTLS
  exige que quien integra maneje certificados de cliente, una fricción
  operativa mucho mayor que verificar un HMAC con una librería estándar en
  cualquier lenguaje. Un secreto plano en una cabecera (`X-Webhook-Secret:
  <secreto>`) es más simple todavía, pero viaja repetido en cada entrega:
  cualquier log de proxy o balanceador que capture cabeceras expone
  directamente el secreto, no solo una firma derivada de él.
- **JWT firmado por la API en vez de HMAC simétrico.** Requeriría que quien
  recibe el webhook valide contra la clave pública de Tasks Platform (JWKS),
  más superficie de configuración para una integración que, en esta fase,
  es de un secreto por endpoint. HMAC con secreto compartido es el estándar
  de facto (Stripe, GitHub, muchos otros) precisamente porque no exige
  gestión de claves asimétricas del lado de quien recibe.

## Consecuencias

- **El secreto viaja una sola vez, en texto plano, y solo hacia quien
  administra el endpoint** (al crearlo o rotarlo); nunca vuelve a aparecer
  en ninguna respuesta posterior. Verificado en
  `test/integration/webhooks-and-api-keys.test.ts` ("the webhook secret
  never appears in a listing or a get").
- **El secreto se guarda en texto plano en la base** (no como hash, a
  diferencia de un refresh token): el worker necesita el valor real para
  firmar cada entrega futura, así que un hash de un solo sentido no
  serviría. Anotado en `docs/DEBT.md` con la solución futura (cifrado en
  reposo cuando exista un gestor de secretos).
- **Quien integra debe guardar el secreto de forma segura** de su lado, y
  la única recuperación ante un secreto comprometido es rotarlo — no hay
  forma de "ver" un secreto olvidado.
