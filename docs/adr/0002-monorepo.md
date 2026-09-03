# 0002 — Monorepo con workspaces

## Contexto

El sistema esta compuesto por varias piezas que se despliegan por separado
pero que comparten contratos: la API HTTP (`apps/api`), un worker que consume
una cola (`apps/worker`), un cliente de demostracion (`apps/web`) y un paquete
de esquemas de validacion compartidos (`packages/contracts`). El frontend
consume las mismas formas de datos que produce y espera la API.

## Decision

Todas estas piezas viven en un unico repositorio, organizado como workspaces
de pnpm (`apps/*`, `packages/*`). `packages/contracts` define los esquemas de
Zod que tanto `apps/api` como `apps/web` importan directamente como
dependencia de workspace (`workspace:*`), de modo que los tipos y las reglas
de validacion tienen una unica fuente de verdad.

## Alternativas consideradas

- **Repositorios separados** para la API, el worker, el frontend y los
  contratos, publicando `contracts` como paquete versionado en un registro
  privado.
- **Un unico paquete sin separacion de workspaces**, con toda la API, el
  worker y el frontend en la misma carpeta.

## Por que no repositorios separados

- Mantener sincronizados los contratos entre backend y frontend via un paquete
  publicado exige un ciclo de version-publish-actualizar-instalar en cada
  cambio, incluso para ajustes pequenos. Eso frena la velocidad de iteracion
  en una fase donde los contratos todavia cambian seguido.
- Coordinar un cambio que toca la API y el frontend a la vez (por ejemplo,
  agregar un campo a una respuesta) requiere pull requests y releases
  sincronizados en varios repositorios.
- Con un solo equipo trabajando sobre todo el sistema, no hay una razon de
  gobernanza (permisos distintos, historiales separados) que justifique la
  separacion.

## Por que no un unico paquete sin workspaces

- Sin limites de paquete, nada impide que la API importe codigo interno del
  frontend o viceversa, ni que el worker dependa por accidente de detalles de
  implementacion de la API.
- Cada pieza tiene su propio ciclo de vida de build, test y despliegue (la API
  y el worker se despliegan como servicios; el frontend se compila a estatico);
  workspaces permiten declarar eso explicitamente sin perder la ventaja de
  compartir codigo.

## Consecuencias

- Un unico `pnpm install` resuelve las dependencias de todo el proyecto, y los
  paquetes de workspace se enlazan localmente sin necesidad de publicarlos.
- Un cambio en `packages/contracts` se ve reflejado de inmediato en
  `apps/api` y `apps/web` sin pasos intermedios de publicacion.
- El repositorio crece en tamano y el CI eventualmente necesitara ejecutar
  solo lo afectado por cada cambio en lugar de todo el monorepo; no es un
  problema en esta fase por el tamano actual del proyecto.
