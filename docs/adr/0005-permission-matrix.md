# 0005 — Matriz de permisos en codigo, no en la base

## Contexto

La Fase 2 introduce cuatro roles fijos (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`)
y necesita decidir, en cada peticion, si el rol del que llama alcanza para la
accion pedida. Hay dos lugares obvios donde guardar esa relacion rol ->
permisos: una tabla en la base de datos (con sus filas de permisos y una
tabla puente rol-permiso), o una estructura fija en el codigo de la
aplicacion.

## Decision

La matriz vive en un unico modulo de codigo
(`apps/api/src/shared/authorization/permissions.ts`): una lista de permisos
tipada con `as const` y un `Record<Role, Permission[]>` que asigna a cada rol
su lista. Referenciar un permiso que no existe en la lista es un error de
compilacion, no un typo silencioso que falla en produccion.

Todo middleware o servicio que necesite decidir una autorizacion consulta
esta matriz (`roleHasPermission`); ninguno compara roles con un `if` a mano.
La unica excepcion deliberada son las invariantes sobre el `OWNER` (no se
puede degradar, expulsar, ni abandonar sin transferir antes): esas no son
"el rol X tiene el permiso Y", sino una regla sobre el *estado* de la
organizacion (siempre debe existir exactamente un `OWNER`) y sobre la
*relacion* entre quien actua y a quien afecta. Por eso viven como
validaciones explicitas en `members.service.ts`, no en la matriz.

## Alternativas consideradas

- **Tabla `Role` + tabla `Permission` + tabla puente `RolePermission` en la
  base.** Permite en teoria cambiar permisos sin desplegar codigo nuevo, y es
  el patron habitual cuando los roles son configurables por el usuario. Pero
  PHASE.md ya cerro esa pregunta: los roles son fijos, no hay UI para crearlos
  ni editarlos. Sin esa necesidad, el join extra en cada peticion autenticada
  es puro costo sin beneficio, y un cambio de permisos terminaria haciendose
  con una migracion de todos modos (para no dejar el reparto inconsistente
  entre ambientes), asi que la supuesta ventaja de "cambiar en caliente" nunca
  se ejerce en la practica.
- **Permisos como bits en un enum/bitmask.** Mas compacto para guardar en un
  token o en una columna, pero peor para leer y revisar en un Pull Request
  (un numero no dice que representa sin ir a buscar la definicion), y esta
  fase no tiene ninguna restriccion de tamaño que lo justifique.
- **Comparar el rol directamente en cada controller/service** (`if (role ===
  'OWNER' || role === 'ADMIN')`). Es lo que este ADR existe para evitar: la
  logica de "quien puede hacer que" queda esparcida por todo el codebase, y
  agregar un permiso nuevo obliga a auditar cada lugar donde se compara un
  rol a mano en vez de tocar un solo archivo.

## Consecuencias

- Cambiar el reparto de permisos es un commit y un Pull Request como
  cualquier otro cambio de codigo: se revisa y se testea (el recorrido de la
  matriz en `members.test.ts` rompe si un permiso queda mal repartido), en
  vez de una operacion de datos que podria hacerse en caliente sin revision.
- El costo es que un cambio de permisos requiere un despliegue nuevo de la
  API. Es aceptable porque, como se explica arriba, un cambio hecho solo en
  la base nunca iba a desplegarse "en caliente" en la practica sin coordinar
  todos los ambientes de todos modos.
- El reparto sugerido en PHASE.md se ajusto en un punto: `member:leave` se
  otorga a los cuatro roles (incluido `OWNER`) porque abandonar la
  organizacion es, en principio, algo que cualquier miembro puede intentar; lo
  que distingue al `OWNER` es que su intento falla por la invariante del unico
  owner, no por falta de permiso. Modelarlo como "el `OWNER` no tiene el
  permiso `member:leave`" hubiera mezclado una regla de estado con una
  capacidad de rol, y hubiera hecho que el error que ve un `OWNER` al intentar
  abandonar fuera un 403 generico en vez de un 409 que explica el motivo real
  (falta transferir la propiedad).
