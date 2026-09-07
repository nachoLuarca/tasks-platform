# Fase actual: 1.5 — Deuda técnica y CI

**Objetivo:** dejar el proyecto verificable de forma automática. Al terminar,
cada Pull Request corre lint, typecheck, tests y construcción de la imagen
Docker, y `main` no acepta merges con los checks en rojo.

Es una fase corta. No agrega funcionalidad: paga deuda y monta el pipeline.

**Rama:** `chore/ci-pipeline`
**Tag al cerrar:** `v0.2.1`

---

## Los tres problemas a resolver

Los tres se detectaron verificando a mano la Fase 1. Ninguno es teórico.

### 1. La construcción de la imagen Docker está rota

`docker compose build api` falla. El script `postinstall` de la raíz compila
`packages/contracts` con `tsc`, pero el stage `deps` del Dockerfile solo copia
los `package.json` — no el código fuente ni los `tsconfig.json`. Esa separación
es intencional y sirve para cachear dependencias, así que la solución no es
copiar todo antes.

El arreglo va por el lado de que el `install` dentro de Docker no dispare los
scripts, y que la compilación de `contracts` y el `prisma generate` ocurran en
el stage donde el código ya está presente. Cuidado: ignorar todos los scripts
también salta el `postinstall` de `@prisma/engines`, que descarga los binarios
del motor. Verificar que el contenedor arranque, no solo que construya.

### 2. Los tests dependen del `.env` de desarrollo

Sin `JWT_SECRET` en el `.env` local, las seis suites fallan al arranque. En el
CI no existe ningún `.env`, así que fallarían todas.

`apps/api/test/setup-env.ts` debe proveer valores propios para todo lo que la
configuración exige, de modo que `pnpm test` funcione en una máquina sin
`.env`. Los secretos de test son valores fijos y evidentes, nunca reales.

### 3. Los logs de test son ilegibles

Cada test imprime el JSON completo de cada petición. Cuando algo falla, el
error queda enterrado. El logger debe quedar en silencio durante los tests,
salvo que se pida lo contrario por variable de entorno.

---

## Alcance

### Arreglos
- [ ] `docker compose build api` termina sin errores
- [ ] `docker compose up -d` deja los cuatro servicios en `healthy`
- [ ] `pnpm test` pasa en una máquina sin archivo `.env`
- [ ] La salida de `pnpm test` es legible: solo el resumen de vitest

### Pipeline
- [ ] `.github/workflows/ci.yml` que corre en cada push y cada Pull Request
      contra `main`
- [ ] Servicios de PostgreSQL 17 y Redis para los tests de integración
- [ ] Pasos: instalar dependencias con caché de pnpm, aplicar migraciones,
      `lint`, `typecheck`, `test`
- [ ] Job separado que construye la imagen Docker de la API
- [ ] El workflow no debe tardar más de cinco minutos en total

### Cierre
- [ ] Badge del estado del CI en el README
- [ ] `docs/DEBT.md` actualizado: quitar lo resuelto, dejar lo pendiente
      (imagen de runtime con devDependencies, binarios de esbuild de todas las
      plataformas, versión mayor de Prisma disponible)

---

## Fuera de alcance

- Despliegue, entornos, secretos de producción (Fase 6)
- Publicación de la imagen en un registro (Fase 6)
- `release-please` o generación automática de CHANGELOG (Fase 5)
- Cobertura de código y sus umbrales
- Cualquier funcionalidad nueva: roles, permisos, invitaciones (Fase 2)

---

## Criterio de cierre

1. Sobre un clon limpio y **sin crear ningún `.env`**:
   `pnpm install && pnpm test && pnpm typecheck && pnpm lint` pasa entero
2. `docker compose build api` construye sin errores
3. `docker compose up -d` deja los cuatro servicios en `healthy` y
   `/health/ready` responde 200
4. El Pull Request de esta rama muestra los checks en verde en GitHub
5. La salida de los tests cabe en una pantalla

Después del merge, y solo entonces: activar en el ruleset de `main` la
exigencia de checks verdes para poder mergear. Eso lo hace el usuario en la
interfaz de GitHub, no el agente.

Cumplido eso: Pull Request, merge con commit de merge, y tag `v0.2.1`.
