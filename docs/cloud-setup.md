# Setup para entornos cloud (sin Docker)

`scripts/cloud-setup.sh` deja un entorno Linux limpio listo para correr la
suite completa, sin Docker. Es el equivalente de `docker compose up` para
los servicios que los tests necesitan.

## Uso

```bash
bash scripts/cloud-setup.sh
source ~/.cloud-setup-env   # pone Node 24 en el PATH de esta shell
pnpm test
```

## Que hace

1. **Node 24**: el repo exige `>=24` (ver `.nvmrc`). Si el Node del sistema es
   menor, descarga el binario oficial a `~/.cache/cloud-setup/node` sin tocar
   el del sistema.
2. **pnpm 11.25.0** (la version de `packageManager`).
3. **PostgreSQL y Redis** via `apt`, si no estan instalados, y los arranca.
   Crea el rol y la base `tasks_platform` (mismas credenciales que
   `.env.example` y el CI).
4. **Mailpit** (SMTP `1025`, API `8025`): los tests del worker leen correo
   real, no un mock. Se descarga el binario desde GitHub Releases.
5. `pnpm install --frozen-lockfile` y `db:migrate:deploy`.
6. Escribe `~/.cloud-setup-env` con el `PATH` para shells posteriores.

Es idempotente: volver a ejecutarlo reutiliza lo ya instalado y los
servicios que ya estan corriendo.

## Requisitos de red

Acceso a `nodejs.org`, `registry.npmjs.org`, los repositorios de `apt` y
`github.com` (Mailpit).

## Notas

- Los tests no necesitan `.env`: `test/setup-env.ts` fija los valores y
  coinciden con los defaults del script.
- El rol de Postgres es `SUPERUSER` para que Prisma pueda migrar; es solo
  para entornos efimeros, no para produccion.
- Variables opcionales: `CLOUD_SETUP_TOOLS_DIR` cambia donde se cachean Node
  y Mailpit.
- Los servicios quedan en segundo plano; si el contenedor se reinicia, vuelve
  a ejecutar el script.
