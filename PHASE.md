# Fase actual: 3 — Proyectos y tareas

**Objetivo:** el núcleo del producto. Proyectos dentro de una organización, y
tareas dentro de un proyecto, con listados serios (paginación por cursor,
filtros, orden), control de concurrencia y permisos que distinguen lo propio de
lo ajeno.

**Rama:** `feat/projects-and-tasks`
**Tag al cerrar:** `v0.4.0`

Comentarios, etiquetas y bitácora de actividad quedan para la Fase 3.5. Esta
fase ya es la más grande del proyecto; partirla mantiene la calidad.

---

## Decisiones ya tomadas

No se discuten. El código debe reflejarlas tal cual.

1. **Todo cuelga de la organización:**
   `/v1/organizations/:organizationId/projects` y
   `/v1/organizations/:organizationId/projects/:projectId/tasks`. La membresía
   y el rol se resuelven con los middlewares de la Fase 2.

2. **Cada proyecto tiene una clave corta** de 2 a 5 letras mayúsculas, única
   dentro de la organización: `ENG`, `WEB`, `OPS`.

3. **Las tareas se numeran por proyecto:** `ENG-1`, `ENG-2`. El número es
   secuencial dentro del proyecto y no se reutiliza al borrar. Se genera
   incrementando un contador en la fila del proyecto **dentro de la misma
   transacción** que crea la tarea, para que dos peticiones simultáneas no
   obtengan el mismo número.

4. **Bloqueo optimista en las tareas.** Cada tarea tiene un `version` entero
   que sube en cada modificación. Actualizar exige enviar la versión que se
   leyó; si no coincide, la respuesta es 409 y el cliente debe recargar. Evita
   que dos personas editando a la vez se pisen sin enterarse.

5. **"Propio" significa creada por el usuario o asignada a él.** Es la
   definición que usa el permiso `task:update:own`. Cualquier otra tarea
   requiere `task:update:any`.

6. **Paginación por cursor, no por número de página.** Cursor opaco,
   `limit` de 20 por defecto y 100 como máximo. Todas las listas responden con
   la misma envoltura: los datos y el cursor siguiente, que es nulo cuando no
   hay más.

7. **Borrado lógico** en proyectos y tareas, con `deletedAt`, coherente con el
   resto del sistema. Lo borrado no aparece en los listados.

8. **Estados de tarea:** `TODO`, `IN_PROGRESS`, `DONE`, `CANCELLED`.
   **Prioridades:** `LOW`, `MEDIUM`, `HIGH`, `URGENT`. Al pasar a `DONE` se
   registra `completedAt`; al salir de `DONE` se limpia.

9. **Solo se puede asignar una tarea a un miembro de la organización.** Asignar
   a alguien de fuera devuelve 422.

10. **Los listados no hacen una consulta por elemento.** Traer 20 tareas con su
    responsable son dos consultas como mucho, nunca veintiuna.

---

## Alcance

### Modelo de datos
- [ ] `Project`: id, organizationId, key, name, description, status
      (`ACTIVE` / `ARCHIVED`), taskCounter, createdById, timestamps, deletedAt
- [ ] Único: organizationId + key
- [ ] `Task`: id, projectId, number, title, description, status, priority,
      assigneeId, createdById, dueDate, completedAt, version, timestamps,
      deletedAt
- [ ] Único: projectId + number
- [ ] Índices pensados para los filtros: projectId + status, assigneeId,
      dueDate
- [ ] Migración que no rompe los datos existentes

### Permisos nuevos en la matriz
- [ ] `project:create`, `project:read`, `project:update`, `project:delete`
- [ ] `task:create`, `task:read`, `task:assign`
- [ ] `task:update:own`, `task:update:any`
- [ ] `task:delete:own`, `task:delete:any`
- [ ] Reparto sugerido, ajustable con criterio: `VIEWER` solo lectura;
      `MEMBER` crea tareas y modifica las propias; `ADMIN` y `OWNER` gestionan
      proyectos y cualquier tarea

### Proyectos
- [ ] `POST /v1/organizations/:organizationId/projects`
- [ ] `GET /v1/organizations/:organizationId/projects` — paginado, filtro por
      estado
- [ ] `GET .../projects/:projectId`
- [ ] `PATCH .../projects/:projectId`
- [ ] `DELETE .../projects/:projectId` — borrado lógico, arrastra sus tareas
- [ ] `POST .../projects/:projectId/archive` y `/unarchive`

### Tareas
- [ ] `POST .../projects/:projectId/tasks`
- [ ] `GET .../projects/:projectId/tasks` — paginado, con filtros por estado,
      prioridad, responsable, sin responsable, vencimiento antes o después de
      una fecha, y búsqueda por texto en el título; orden por fecha de
      creación, vencimiento o prioridad
- [ ] `GET .../tasks/:taskId`
- [ ] `PATCH .../tasks/:taskId` — con versión, 409 si no coincide
- [ ] `DELETE .../tasks/:taskId`
- [ ] `POST .../tasks/:taskId/assign` y `/unassign`
- [ ] `GET /v1/organizations/:organizationId/tasks` — todas las tareas de la
      organización asignadas al usuario, con los mismos filtros

### Tests
- [ ] Dos creaciones simultáneas en el mismo proyecto obtienen números
      distintos
- [ ] Actualizar con una versión vieja devuelve 409
- [ ] Un `MEMBER` modifica su tarea pero no la de otro
- [ ] Un `MEMBER` modifica una tarea ajena que le fue asignada
- [ ] Un `VIEWER` no puede crear ni modificar nada
- [ ] Asignar a alguien que no es miembro devuelve 422
- [ ] La paginación recorre el conjunto completo sin repetir ni saltarse nada
- [ ] Cada filtro y cada orden, con su caso
- [ ] Borrar un proyecto oculta sus tareas
- [ ] Pasar a `DONE` marca `completedAt`; salir de `DONE` lo limpia
- [ ] Un no miembro recibe 404 en todas estas rutas
- [ ] Un test que cuente las consultas de un listado y falle si hay una por
      elemento

### Documentación
- [ ] `docs/adr/0006-cursor-pagination.md` — por qué cursor y no offset
- [ ] `docs/adr/0007-optimistic-locking.md` — por qué versión en el cuerpo y no
      cabecera `If-Match`
- [ ] README con los endpoints nuevos y ejemplos de filtros

---

## Fuera de alcance

- Comentarios, etiquetas y bitácora de actividad (Fase 3.5)
- Adjuntos y subida de archivos
- Subtareas, dependencias entre tareas, tableros o vistas kanban
- Orden manual de tareas (arrastrar y soltar)
- Tareas recurrentes, recordatorios, notificaciones
- Webhooks y API keys (Fase 4)
- Búsqueda de texto completo con índices dedicados: basta con una búsqueda
  simple por título

---

## Criterio de cierre

1. Sin archivo `.env`: `pnpm install && pnpm test && pnpm typecheck && pnpm
   lint` pasa entero
2. `docker compose build api` y `docker compose up -d` dejan todo `healthy`
3. Los dos checks del CI en verde en el Pull Request
4. Recorrido manual: crear proyecto con clave, crear tres tareas y comprobar la
   numeración correlativa, filtrar por estado y por responsable, recorrer dos
   páginas con el cursor, provocar un 409 enviando una versión vieja, y
   comprobar que un `VIEWER` no puede crear
5. Ningún listado dispara una consulta por elemento

Cumplido eso: Pull Request, checks verdes, merge con commit de merge, y tag
`v0.4.0`.
