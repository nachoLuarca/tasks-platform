# 0006 — Paginación por cursor, no por offset

## Contexto

La Fase 3 introduce los primeros listados con volumen real: proyectos y,
sobre todo, tareas dentro de un proyecto. Necesitan paginarse. Hay dos formas
habituales de hacerlo: por número de página/offset (`?page=2&limit=20`, que
por debajo es `OFFSET 20 LIMIT 20`), o por cursor (`?cursor=...&limit=20`,
que por debajo es una condición `WHERE` sobre la fila donde terminó la
página anterior, tambien llamada paginación por keyset).

## Decisión

Todos los listados (`GET .../projects`, `GET .../tasks`, `GET
.../organizations/:organizationId/tasks`) usan paginación por cursor. El
cursor es un id de fila (de un `Project` o `Task`), codificado en
base64url para que sea opaco: el cliente nunca lo construye ni lo
interpreta, solo reenvía el `nextCursor` que recibió en la página anterior
(`apps/api/src/shared/pagination/cursor.ts`).

La implementación se apoya en el soporte nativo de Prisma para paginación
por cursor (`cursor` + `skip: 1` + `take: limit + 1`), que resuelve
correctamente incluso con `orderBy` de más de un campo (por ejemplo,
`priority` y luego `id` como desempate). Pedir `limit + 1` filas permite
saber si hay una página siguiente sin una consulta `COUNT` aparte: si
sobra una fila, se recorta y su id se convierte en el próximo cursor.

El problema concreto que esto evita es el de **resultados desplazados**: con
offset, la posición de una fila en el conjunto ordenado depende de cuántas
filas hay antes de ella en ese momento. Si alguien inserta o borra una fila
entre que el cliente pide la página 1 y la página 2, el `OFFSET 20` de la
página 2 ya no apunta a donde apuntaba cuando se calculó, y el cliente ve un
elemento repetido o se salta uno sin darse cuenta. Con cursor, la condición
de continuación es "la fila que viene después de esta, según el orden", que
no cambia con la cantidad de filas que haya antes: es la propiedad que
verifica `pagination > traverses the full set exactly once` en
`tasks.test.ts`.

## Alternativas consideradas

- **Offset (`page`/`limit` clásicos).** Es el enfoque más simple de
  implementar y el más familiar para quien consume la API, y permite saltar
  directamente a una página arbitraria ("ir a la página 7"), algo que un
  cursor no permite (solo se puede avanzar o retroceder, nunca saltar). Se
  descartó por el problema de resultados desplazados de arriba, que en un
  recurso con escritura concurrente (tareas que se crean y borran todo el
  tiempo) no es un caso raro sino el caso esperado.
- **Offset con un `ORDER BY` estable y advertencia en la documentación.**
  Reduce el problema pero no lo elimina, y traslada la responsabilidad de
  saberlo a quien consume la API. Un cursor opaco hace la garantía
  automática en vez de documentada.
- **Cursor construido por el cliente** (por ejemplo, mandar directamente el
  `createdAt` y el `id` de la última fila vista). Funciona igual de bien
  técnicamente, pero expone detalles de implementación (qué campos ordenan,
  qué formato tienen) que después atan las manos para cambiar el esquema de
  ordenamiento sin romper clientes. Codificar el cursor como un token opaco
  evita ese acoplamiento.

## Consecuencias

- No hay forma de pedir "la página 7" directamente ni de saber cuántas
  páginas hay en total sin una consulta aparte; para los listados de esta
  fase (proyectos y tareas dentro de una organización, uso normal de
  scroll/paginado hacia adelante) no hace falta, y no está en el alcance de
  la Fase 3.
- Cada endpoint paginado responde con la misma envoltura
  (`{ data, nextCursor }`), definida una sola vez en
  `packages/contracts/src/pagination.schema.ts`.
- El límite por defecto es 20 y el máximo 100
  (`packages/contracts/src/pagination.schema.ts`); pedir más de 100 es un
  error de validación, no un límite silencioso.
