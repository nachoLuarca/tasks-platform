# Fase actual: 6 — Despliegue

**Objetivo:** el proyecto corriendo en internet, gratis, con despliegue
automático desde `main`. Blueprint declarativo, base de datos y cola
gestionadas fuera de Render, y monitoreo básico que evita que el servicio
duerma cuando alguien lo está probando.

**Rama:** `feat/deployment`
**Tag:** ninguno creado a mano. El versionado sigue siendo responsabilidad
exclusiva de `release-please`; esta fase no introduce un tag `v1.0.0`
artificial. El README documenta en qué versión quedó el primer despliegue
público.

Fase corta. Gran parte del trabajo es configuración en paneles externos que
Claude Code no puede tocar — eso lo hace el usuario a mano, guiado aparte.
Esta rama prepara únicamente lo que vive en el repositorio.

---

## Decisiones ya tomadas

1. **Render aloja el cómputo; Neon y Upstash alojan el estado.** Postgres
   gratuito de Render expira a los 30 días; Neon no. Redis gratuito de Render
   es de 25 MB; Upstash da más margen sin costo. Ningún dato vive en un
   servicio que pueda desaparecer sin aviso.

2. **El worker se despliega como Web Service, no como Background Worker.**
   Los Background Workers de Render no tienen capa gratuita. El worker ya
   expone `apps/worker/src/health-server.ts` en un puerto HTTP: eso basta
   para que Render lo trate como un servicio web válido. Por dentro sigue
   siendo BullMQ consumiendo Redis; Render nunca lo sabe ni le importa.

3. **Un único entorno de producción, no staging más producción.** El plan
   original de dos entornos asumía un servidor propio donde levantar dos
   máquinas era gratis. En Render, cada Web Service adicional es otro
   servicio con su propio límite de sueño; duplicar entornos no aporta nada
   en un proyecto de portafolio sin tráfico real. `main` protegida con CI
   obligatorio ya cumple el papel de red de seguridad antes de desplegar.

4. **Despliegue automático en cada push a `main`.** Sin paso manual, sin
   aprobación adicional: los checks obligatorios de `main` ya son el punto
   de control.

5. **Blueprint declarativo (`render.yaml`) en la raíz del repo.** Los dos
   servicios, sus rutas de Dockerfile y sus variables de entorno quedan
   versionados en git, no armados a mano en el panel de Render.

6. **Ambos Dockerfiles apuntan al stage `runtime`, no a `dev`.** El stage de
   desarrollo reconstruye `contracts` y corre `prisma generate` al arrancar,
   pensado para el hot reload local. En producción eso es tiempo de arranque
   desperdiciado en cada despliegue; el stage `runtime` ya compilado existe
   desde la Fase 0 y hasta ahora no se usaba en ningún lado.

7. **Los secretos se configuran en el panel de Render, nunca en el
   repositorio.** `render.yaml` declara qué variables existen y cuáles se
   generan solas (como `JWT_SECRET`); los valores de Neon, Upstash y SMTP se
   pegan a mano una sola vez.

8. **El correo de producción usa un proveedor SMTP real**, no Mailpit.
   Mailpit sigue existiendo solo en `docker-compose.yml` para desarrollo
   local; en Render, `apps/worker` apunta a las credenciales SMTP reales
   provistas por variables de entorno.

9. **`GET /health/live` es el endpoint que usa Render para decidir si el
   servicio sigue vivo**, y el mismo que usa el pinger externo para evitar
   que duerma. El worker expone el suyo propio en `/health`.

---

## Alcance

### Blueprint
- [ ] `render.yaml` en la raíz, con dos servicios: `api` y `worker`, cada
      uno con su `dockerfilePath`, `dockerContext` y el stage `runtime`
- [ ] Variables de entorno declaradas para ambos: las que Render genera
      solas (`JWT_SECRET` con `generateValue: true`) y las que el usuario
      debe completar a mano tras el primer despliegue
- [ ] `healthCheckPath` configurado para cada servicio, apuntando a su
      endpoint real
- [ ] Plan `free` explícito en ambos servicios

### Dockerfiles
- [ ] Confirmar que el stage `runtime` de `docker/api.Dockerfile` y
      `docker/worker.Dockerfile` produce una imagen que arranca sin
      necesidad de `pnpm install` ni `prisma generate` en el arranque
- [ ] El stage `runtime` corre `prisma migrate deploy` como parte del
      arranque del contenedor, antes de levantar el servidor, para que la
      base de datos de producción quede al día con cada despliegue

### Configuración de producción
- [ ] `.env.example` documenta, con un comentario claro, cuáles variables
      son para desarrollo local y cuáles se completan solo en el panel de
      Render
- [ ] CORS configurado para aceptar el dominio del front de demostración de
      la Fase 7, una vez que exista; por ahora, documentado como pendiente
- [ ] Confirmar que el logger no imprime nada de nivel `debug` en producción

### Documentación
- [ ] `docs/adr/0013-render-deployment.md` — por qué Render con Neon y
      Upstash en vez de un servidor propio, qué se ganó y qué se sacrificó
      (cold starts, sin control del sistema operativo, dependiente de tres
      proveedores gratuitos distintos)
- [ ] README con las URLs del despliegue una vez que existan, y un aviso
      explícito de que el servicio puede tardar hasta un minuto en responder
      tras un período de inactividad
- [ ] `docs/DEBT.md` actualizado con la limitación del sueño por inactividad
      y la ausencia de backups gestionados en la capa gratuita de Neon

---

## Fuera de alcance

- Dominio propio: se usa el subdominio que asigna Render por defecto
- Entorno de staging separado
- CDN o cualquier optimización de borde
- Migración de Oracle si en algún momento consigue capacidad: quedaría para
  una fase aparte, no forzada aquí
- Backups automatizados de la base de datos más allá de lo que Neon ofrezca
  gratis
- Cualquier cambio de funcionalidad del backend: esta fase es solo despliegue

---

## Lo que hace el usuario fuera del código

Esto no lo prepara el agente, porque requiere cuentas y paneles externos.
Se hace después de que esta rama esté mergeada:

1. Crear un proyecto en Neon y obtener la cadena de conexión de Postgres
2. Crear una base en Upstash y obtener la URL de Redis
3. Crear una cuenta en Render, conectar el repositorio de GitHub
4. Desplegar desde el Blueprint (`render.yaml`) que esta fase deja listo
5. Completar en el panel de Render las variables que no se generan solas:
   la cadena de Neon, la URL de Upstash, y las credenciales SMTP
6. Configurar un monitor gratuito en UptimeRobot contra `/health/live` de la
   API y `/health` del worker, cada 5 a 10 minutos

---

## Criterio de cierre

1. Sin archivo `.env`: `pnpm install && pnpm test && pnpm typecheck && pnpm
   lint` pasa entero
2. `docker compose build api` y `docker compose build worker` siguen
   funcionando igual que antes para desarrollo local; esta fase no rompe el
   flujo existente
3. Los tres checks del CI en verde en el Pull Request
4. `render.yaml` es válido y describe correctamente los dos servicios, según
   la validación que ofrezca el propio panel de Render al importarlo
5. Una vez desplegado por el usuario: `curl` a la URL pública de la API
   responde 200 en `/health/live`, y `/docs` muestra Swagger UI

Cumplido lo del repositorio: Pull Request, checks verdes, merge con commit de
merge. El resto del criterio se verifica después, en el panel de Render, con
el usuario guiado paso a paso fuera del código.
