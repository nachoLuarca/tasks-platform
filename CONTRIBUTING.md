# Como contribuir

Las reglas de arquitectura, capas y flujo de git estan en
[`ARCHITECTURE.md`](./ARCHITECTURE.md). Este archivo cubre lo que cambio con la
Fase 5: los mensajes de commit ahora deciden la version del proyecto.

## Los commits deciden la version

Desde `v0.8.0`, [release-please](https://github.com/googleapis/release-please)
lee los commits que llegan a `main`, calcula la proxima version, escribe el
`CHANGELOG.md` y crea el tag. Nadie pone tags a mano ni edita el changelog.

Por eso el tipo de cada commit ya no es solo una cuestion de legibilidad: un
`feat` mal puesto publica una version minor, y un `fix` escrito como `chore`
nunca aparece en el changelog.

Formato ([Conventional Commits](https://www.conventionalcommits.org/)), en
ingles e imperativo:

```
<tipo>[(alcance opcional)][!]: <descripcion>

[cuerpo opcional]

[BREAKING CHANGE: <que se rompe y como migrar>]
```

| Tipo | Cuando | Efecto en la version | Aparece en el changelog |
| --- | --- | --- | --- |
| `feat` | Algo nuevo para quien usa la API | minor (`0.7.0` -> `0.8.0`) | Si, en Features |
| `fix` | Corrige un comportamiento incorrecto | patch (`0.8.0` -> `0.8.1`) | Si, en Bug Fixes |
| `perf` | Mejora de rendimiento sin cambio de comportamiento | patch | Si |
| `docs`, `test`, `chore`, `ci`, `refactor`, `build`, `style` | Todo lo que no cambia lo que la API hace | Ninguno por si solo | No |
| Cualquiera con `!` o con un pie `BREAKING CHANGE:` | Rompe el contrato: se quita un campo, cambia un tipo o se elimina una ruta | major (tambien desde `0.x`: `0.8.0` -> `1.0.0`) | Si, destacado |

Ejemplos:

```
feat: add due date reminders to tasks
fix: return 404 instead of 500 for a malformed task id
docs: explain cursor pagination in the README
feat!: remove the deprecated invitation link from the create response

BREAKING CHANGE: POST /v1/organizations/:organizationId/invitations no longer
returns `acceptUrl`; the link is only sent by email.
```

Criterios practicos:

- Si dudas entre `feat` y `fix`, pregunta si quien integra obtiene algo que
  antes no podia hacer (`feat`) o algo que ya deberia haber funcionado (`fix`).
- Un cambio en `packages/contracts` que quita o renombra un campo, lo vuelve
  obligatorio o cambia su tipo es un **breaking change**, aunque el commit sea
  pequeño.
- Los Pull Requests se integran con merge commit (`--no-ff`). release-please
  lee **cada commit de la rama**; el titulo del merge ("Merge pull request
  #N ...") se ignora. Cada commit tiene que tener su tipo correcto, no solo el
  ultimo.

## Como sale un release

1. Cada push a `main` corre el workflow `Release`
   (`.github/workflows/release-please.yml`), que abre o actualiza un Pull
   Request llamado `chore(main): release X.Y.Z`, con el changelog propuesto y
   la version nueva en `package.json` y `apps/api/package.json`.
2. Ese Pull Request queda abierto y se va actualizando con cada merge.
3. Cuando se quiere publicar, se mergea como cualquier otro, con los checks de
   CI en verde. El workflow crea entonces el tag `vX.Y.Z` y el release de
   GitHub.

La version del repositorio no es la del contrato HTTP: el prefijo `/v1` de las
rutas se cambia solo por una decision explicita, nunca por lo que diga
`package.json`.

### Configuracion del repositorio (una vez)

Un Pull Request abierto con el `GITHUB_TOKEN` por defecto no dispara otros
workflows, y `main` exige checks en verde. Para que CI corra sobre el PR de
release, el workflow usa el secret `RELEASE_PLEASE_TOKEN`: un token
fine-grained con acceso a este repositorio y permisos de lectura y escritura en
**Contents** y **Pull requests**. Sin ese secret, el workflow usa el
`GITHUB_TOKEN`: hay que habilitar *Settings -> Actions -> General -> Allow
GitHub Actions to create and approve pull requests*, y para que CI corra sobre
el PR de release habra que cerrarlo y reabrirlo a mano cada vez.

## Antes de abrir un Pull Request

```bash
pnpm lint
pnpm typecheck
pnpm test          # con el stack levantado: Postgres, Redis y Mailpit
pnpm --filter @tasks-platform/api run openapi:check
```

Si agregas o cambias una ruta, actualiza tambien el `<dominio>.openapi.ts` del
modulo. Si te olvidas, el test de cobertura de la especificacion falla y lo
indica (ver [ADR 0012](./docs/adr/0012-generated-openapi.md)).
