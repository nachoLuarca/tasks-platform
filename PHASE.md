# Fase actual: 5 — Release automático y OpenAPI

**Objetivo:** que versionar y documentar la API dejen de ser pasos manuales.
Changelog generado desde los commits, tags automáticos, y una especificación
OpenAPI publicada desde los mismos esquemas Zod que ya validan cada petición.

**Rama:** `feat/release-automation-and-openapi`
**Tag al cerrar:** `v0.8.0`

Última fase antes del despliegue. Corta comparada con las últimas cuatro.

---

## Decisiones ya tomadas

1. **`release-please` gestiona la versión.** Lee los Conventional Commits desde
   el último release, decide si el próximo es patch, minor o major, mantiene
   un Pull Request de release siempre abierto con el changelog propuesto, y al
   mergear ese PR crea el tag y publica el release en GitHub. Los tags dejan
   de ponerse a mano.

2. **De aquí en adelante, un solo tipo de tag.** Hasta ahora se etiquetó cada
   fase manualmente (`v0.1.0` a `v0.7.0`). Desde esta fase, todos los tags
   futuros los crea `release-please`. Los tags existentes no se tocan ni se
   reescriben: quedan como el historial real del proyecto.

3. **La documentación de la API se genera, no se escribe.** Los esquemas Zod
   de `packages/contracts` ya son la fuente de verdad de cada payload; de ahí
   se deriva OpenAPI 3.1 en vez de mantener una especificación aparte que se
   desincroniza con el código en la primera fase que alguien apure.

4. **Swagger UI se sirve desde la propia API**, en una ruta pública sin
   autenticación, separada de las rutas de negocio bajo `/v1`.

5. **El versionado de la API y el versionado del paquete son cosas
   distintas.** El release de `release-please` versiona el repositorio; el
   prefijo `/v1` de las rutas versiona el contrato HTTP. Pasar a `v2` algún día
   no depende de qué diga `package.json`.

6. **CI construye la especificación en cada Pull Request** y falla si no
   compila, para que un contrato roto no llegue a `main` sin que nadie lo note.

---

## Alcance

### release-please
- [ ] Configuración de `release-please` para el repositorio, en modo
      manifiesto, con `apps/api` como el paquete cuya versión se expone
      (aunque el release sea del monorepo completo)
- [ ] Workflow de GitHub Actions que corre en cada push a `main`: abre o
      actualiza el Pull Request de release, y al mergearlo crea el tag y el
      release de GitHub
- [ ] `CHANGELOG.md` generado, con las entradas de las fases 0 a 4.5
      reconstruidas a mano una sola vez a partir de los tags existentes, como
      punto de partida
- [ ] Verificar que el primer PR de release que abre corresponda a la versión
      esperada, coherente con `v0.7.0`

### OpenAPI
- [ ] Generación de la especificación 3.1 a partir de los esquemas Zod de
      `packages/contracts`, con metadatos por ruta: resumen, descripción,
      códigos de respuesta, ejemplos donde ayude
- [ ] Cobertura de todos los módulos existentes: auth, users, organizations,
      members, invitations, projects, tasks, comments, labels, activity,
      webhooks, api-keys, email-verification, password-reset
- [ ] Los esquemas de error usan la forma RFC 9457 ya establecida
- [ ] `GET /openapi.json` sirve la especificación
- [ ] Swagger UI servido en `/docs`, público, sin autenticación
- [ ] Paso de CI que genera la especificación y falla si no compila o si
      queda desactualizada respecto a los contratos

### Documentación
- [ ] `docs/adr/0012-generated-openapi.md` — por qué se genera desde Zod en
      vez de mantenerse a mano
- [ ] README con un enlace a `/docs` y una nota de que el CHANGELOG se genera
      solo desde ahora
- [ ] `CONTRIBUTING.md` breve explicando Conventional Commits para quien
      revise el repositorio, ya que ahora determinan la versión automáticamente

### Tests
- [ ] La especificación generada es JSON válido y cumple el esquema de
      OpenAPI 3.1
- [ ] Cada ruta registrada en el enrutador de Express tiene su contraparte en
      la especificación generada, para detectar un endpoint olvidado
- [ ] `/docs` responde 200 sin autenticación
- [ ] `/openapi.json` no expone rutas internas de salud ni nada fuera de `/v1`

---

## Fuera de alcance

- Publicar el paquete `contracts` en un registro de npm público o privado
- Versionado de API con múltiples versiones activas simultáneamente (`/v1` y
  `/v2` coexistiendo)
- SDKs generados a partir de la especificación
- Cualquier cambio de infraestructura o despliegue: eso es la Fase 6
- Reescribir o corregir el historial de commits de fases anteriores para que
  `release-please` los reprocese

---

## Criterio de cierre

1. Sin archivo `.env`, con el stack levantado:
   `pnpm install && pnpm test && pnpm typecheck && pnpm lint` pasa entero
2. `docker compose up -d --build` deja los cinco servicios `healthy`
3. Los dos checks del CI en verde en el Pull Request, más el nuevo paso que
   valida la especificación OpenAPI
4. `curl localhost:3000/docs` responde 200 y muestra Swagger UI con todos los
   módulos listados
5. Al mergear esta fase a `main`, `release-please` abre su primer Pull Request
   de release con un changelog coherente

Cumplido eso: Pull Request, checks verdes, merge con commit de merge. Esta vez
**no se crea el tag a mano** — se deja que el flujo de `release-please` abra su
Pull Request de release por separado, y ese es el que se mergea para producir
`v0.8.0`.
