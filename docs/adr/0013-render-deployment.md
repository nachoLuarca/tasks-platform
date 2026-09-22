# 0013 — El despliegue vive en Render, con Neon y Upstash como estado

## Contexto

Hasta la Fase 5 el proyecto solo corria en la maquina de quien lo desarrolla,
con `docker compose up`. La Fase 6 lo pone en internet con una condicion
dura: costo cero. No hay presupuesto de infraestructura y no lo va a haber,
porque es un proyecto de portafolio; lo que se despliega tiene que seguir
funcionando dentro de una capa gratuita indefinidamente, sin tarjeta y sin un
periodo de prueba que venza.

Eso descarta de entrada el camino "clasico" (un VPS propio, aunque sea el mas
barato) y obliga a elegir entre plataformas gratuitas, que son gratuitas
precisamente porque imponen limites.

## Decision

El computo se despliega en **Render**, con un Blueprint declarativo
(`render.yaml`) en la raiz del repositorio. El estado no vive en Render:
**Postgres en Neon**, **Redis en Upstash**.

## Por que no un servidor propio

Un VPS da control total: se elige el sistema operativo, se instala Postgres y
Redis al lado de la aplicacion, y no hay limite de horas ni de sueño. El
costo no es el precio (hay opciones de pocos dolares al mes), es el trabajo
recurrente que nadie ve en un repositorio y que igual hay que hacer:

- Aprovisionar y endurecer el sistema: usuarios, `ssh`, firewall, parches de
  seguridad del sistema operativo indefinidamente.
- Conseguir y **renovar** certificados TLS, y mantener el proxy inverso que
  los sirve.
- Montar el despliegue continuo a mano: un runner que haga `pull`, construya
  la imagen y reinicie el servicio sin cortar el trafico.
- Hacerse cargo de los backups de Postgres, del monitoreo y de que la maquina
  vuelva sola despues de un reinicio.

Nada de eso aporta al proyecto lo que el proyecto quiere demostrar, que es
como esta construida la API. Render entrega esas cuatro cosas de fabrica: no
hay sistema operativo que administrar, el TLS es automatico y se renueva
solo, y cada push a `main` dispara un despliegue desde el mismo Dockerfile
que ya se usaba en desarrollo.

## Por que el estado no vive en Render

Render tiene Postgres y Redis (Key Value) gestionados, y usarlos hubiera
dejado todo en un solo proveedor. No se hizo, por una razon concreta de cada
uno:

- **Postgres gratuito de Render expira a los 30 dias.** No se degrada: se
  borra. Una base que desaparece sola al mes no es una base de produccion.
  Neon no tiene ese vencimiento.
- **Redis gratuito de Render son 25 MB.** Upstash da mas margen en su capa
  gratuita para la cola de BullMQ y el rate limiting sin costo.

El precio de esta decision es tener tres proveedores en vez de uno (ver mas
abajo). Se pago igual: ningun dato del proyecto puede vivir en un servicio
que lo borre por calendario.

## Por que el worker es un Web Service y no un Background Worker

Render tiene un tipo de servicio hecho exactamente para esto —
`type: worker`, procesos sin puerto HTTP — y aun asi el Blueprint declara el
worker como `type: web`. El motivo es unico y suficiente: **los Background
Workers de Render no tienen capa gratuita**. Son de pago desde el primer
minuto. Con la restriccion de costo cero, ese tipo de servicio no esta
disponible, por mas que sea el correcto conceptualmente.

La adaptacion no cuesta nada, porque el worker ya expone un servidor HTTP:
`apps/worker/src/health-server.ts` responde `GET /health/live` y
`GET /health/ready` en el puerto 3100, creado en la Fase 4 para el
`healthcheck` de `docker-compose.yml`. Eso es todo lo que Render necesita
para aceptar el servicio como web: un puerto abierto que responda. Por
dentro, el proceso sigue siendo lo que siempre fue — BullMQ consumiendo
Redis y el despachador del outbox leyendo Postgres — y Render nunca se entera.

La consecuencia real no es tecnica sino de comportamiento: un Web Service
gratuito **duerme tras 15 minutos sin trafico HTTP**, y el trafico del worker
no es HTTP. Dormido, deja de consumir la cola. Por eso el mismo monitor
externo que mantiene despierta a la API apunta tambien a `/health/live` del
worker; queda anotado en `docs/DEBT.md` como lo que es: una mitigacion, no
una solucion.

## Consecuencias

Lo que se gana:

- Cero administracion de sistema operativo, y cero mantenimiento de TLS.
- Despliegue continuo desde `main` sin infraestructura propia de CI/CD: los
  checks obligatorios de la rama ya son el control previo.
- La infraestructura queda versionada en git (`render.yaml`), no armada a
  mano en un panel que nadie puede revisar en un Pull Request.
- Ningun secreto en el repositorio: Render genera `JWT_SECRET` solo, y el
  resto se carga una vez en el panel.

Lo que se sacrifica:

- **Cold starts.** Los servicios gratuitos duermen tras 15 minutos de
  inactividad, y volver a levantarlos toma hasta un minuto. El primer request
  de una demostracion es siempre el lento.
- **Tres proveedores gratuitos en vez de uno.** Render, Neon y Upstash tienen
  cada uno sus propios limites, su propia disponibilidad y su propia politica
  de capa gratuita, que pueden cambiar sin aviso. Son tres puntos de fallo
  independientes y tres paneles distintos donde mirar cuando algo no anda.
- **Sin control del entorno de ejecucion.** No hay acceso a la maquina: no se
  elige la version del kernel, no se instalan paquetes del sistema fuera de
  lo que diga el Dockerfile, y no hay forma de entrar a inspeccionar un
  proceso en vivo. Lo unico observable es lo que la aplicacion imprima en sus
  logs.
- **Sin backups gestionados.** La capa gratuita de Neon no incluye backups
  automatizados; tambien anotado en `docs/DEBT.md`.

## Alternativas descartadas

- **Fly.io**: su capa gratuita dejo de existir como tal (ahora es credito de
  prueba con tarjeta obligatoria).
- **Railway**: su plan gratuito paso a ser un credito de prueba que se agota.
- **Oracle Cloud Free Tier** (una VM siempre gratuita, que resolveria el
  problema del sueño): no hay capacidad disponible para crear la instancia
  desde hace tiempo en la region que corresponde. `PHASE.md` la deja anotada
  como posible migracion futura, no forzada aca.
- **Vercel / Netlify**: pensadas para front y funciones sin estado; no hay
  donde correr un proceso worker de larga vida consumiendo una cola.

## Nota de implementacion: las migraciones corren al arrancar

`docker/api-entrypoint.sh` ejecuta `prisma migrate deploy` antes de levantar
Express, y el script corre con `set -e`: si la migracion falla, el contenedor
muere en vez de empezar a servir peticiones contra un schema que no coincide
con el codigo recien desplegado. Render ve el arranque fallido, mantiene la
version anterior sirviendo trafico y marca el despliegue como fallido.

La alternativa era un paso de migracion aparte, manual, antes de cada
despliegue. En Render gratuito no existe un Job donde correrlo, y un paso
manual que hay que acordarse de ejecutar es exactamente el tipo de cosa que
se olvida. `migrate deploy` es idempotente por diseño — aplica solo las
migraciones que faltan en la tabla `_prisma_migrations` del destino, y no
hace nada si no falta ninguna — asi que correrlo en cada arranque, incluido
cada reinicio por haber despertado del sueño, es seguro.

El worker no migra: `docker/worker-entrypoint.sh` arranca el proceso y nada
mas. El schema tiene un solo dueño, la api.
