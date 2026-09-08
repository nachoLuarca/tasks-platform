# Fase actual: 3.5 — Comentarios, etiquetas y bitácora

**Objetivo:** cerrar el dominio. Conversación sobre las tareas, clasificación
con etiquetas reutilizables, y un registro de qué pasó con cada tarea y quién
lo hizo.

**Rama:** `feat/comments-labels-activity`
**Tag al cerrar:** `v0.5.0`

Fase más corta que la 3. La bitácora de actividad es la pieza que prepara los
webhooks de la Fase 4: cada entrada registrada aquí será después un evento
publicable.

---

## Decisiones ya tomadas

1. **Nadie edita el comentario de otro.** Ni el `OWNER`. Un comentario es la voz
   de quien lo escribió y alterarla no tiene justificación. Borrarlo sí puede
   hacerlo un `ADMIN` u `OWNER`, porque moderar es distinto de reescribir.

2. **Los comentarios se editan, no se reescriben en silencio.** Al modificar
   uno se registra `editedAt`, y la respuesta lo expone para que un cliente
   pueda mostrar que fue editado.

3. **Las etiquetas pertenecen a la organización, no al proyecto.** Se
   reutilizan entre proyectos. Nombre único por organización, sin distinguir
   mayúsculas, y color en formato hexadecimal.

4. **Aplicar una etiqueta a una tarea es modificar la tarea.** No requiere
   permiso propio: se rige por `task:update:own` o `task:update:any`, igual que
   cambiar el título. Crear, renombrar y borrar etiquetas sí es
   `label:manage`.

5. **Se agrega `task:assign:self`.** Un `MEMBER` puede tomar una tarea sin
   responsable y soltarla, pero no puede asignársela a otra persona. Corrige la
   restricción de la Fase 3, donde un `MEMBER` no podía siquiera tomar trabajo.

6. **La bitácora se escribe en la misma transacción que el cambio.** Si la
   modificación falla y se revierte, no queda una entrada mintiendo sobre algo
   que nunca pasó.

7. **La bitácora es de solo lectura.** No hay endpoint para crear, editar ni
   borrar entradas. Se genera sola.

8. **Cada entrada guarda el antes y el después** en un campo estructurado. Un
   cambio de estado registra de qué valor a qué valor, no solo que "cambió el
   estado".

9. **Borrar una tarea o un comentario es lógico**, coherente con el resto. Un
   comentario borrado desaparece del listado pero su entrada en la bitácora
   permanece.

---

## Alcance

### Modelo de datos
- [ ] `Comment`: id, taskId, authorId, body, editedAt, timestamps, deletedAt
- [ ] `Label`: id, organizationId, name, color, timestamps. Único por
      organización sin distinguir mayúsculas
- [ ] `TaskLabel`: relación tarea-etiqueta, única por par
- [ ] `TaskActivity`: id, taskId, actorId, type, changes (estructurado),
      createdAt
- [ ] Índices para los listados: taskId con createdAt en comentarios y
      bitácora

### Permisos nuevos
- [ ] `comment:create`, `comment:update:own`, `comment:delete:own`,
      `comment:delete:any`
- [ ] `label:manage`
- [ ] `task:assign:self`
- [ ] Reparto sugerido: `VIEWER` solo lee comentarios y bitácora; `MEMBER`
      comenta, edita y borra los suyos, y se asigna tareas libres; `ADMIN` y
      `OWNER` además gestionan etiquetas y borran cualquier comentario

### Comentarios
- [ ] `POST .../tasks/:taskId/comments`
- [ ] `GET .../tasks/:taskId/comments` — paginado, orden cronológico
- [ ] `PATCH .../comments/:commentId` — solo el autor
- [ ] `DELETE .../comments/:commentId`

### Etiquetas
- [ ] `POST /v1/organizations/:organizationId/labels`
- [ ] `GET /v1/organizations/:organizationId/labels`
- [ ] `PATCH .../labels/:labelId`
- [ ] `DELETE .../labels/:labelId` — se quita de todas las tareas que la usaban
- [ ] `PUT .../tasks/:taskId/labels` — fija el conjunto completo de etiquetas
      de la tarea de una vez
- [ ] Filtro por etiqueta en el listado de tareas de la Fase 3

### Bitácora
- [ ] Se registra al crear una tarea, y al cambiar estado, prioridad,
      responsable, fecha de vencimiento, título y etiquetas
- [ ] Se registra al comentar
- [ ] `GET .../tasks/:taskId/activity` — paginado, del más reciente al más
      antiguo
- [ ] La entrada incluye quién, cuándo, qué cambió, y de qué valor a cuál

### Tests
- [ ] El autor edita su comentario; nadie más puede, ni el `OWNER`
- [ ] Un `ADMIN` borra el comentario de otro; un `MEMBER` no
- [ ] Dos etiquetas con el mismo nombre en distinto uso de mayúsculas chocan
- [ ] La misma etiqueta puede existir en dos organizaciones distintas
- [ ] Borrar una etiqueta la quita de las tareas sin borrarlas
- [ ] Un `MEMBER` toma una tarea sin responsable, pero no puede asignársela a
      otro
- [ ] Cambiar el estado deja una entrada con el valor anterior y el nuevo
- [ ] **Si la actualización de la tarea falla, no queda entrada en la
      bitácora**
- [ ] La bitácora no expone endpoints de escritura
- [ ] Listar comentarios con sus autores no dispara una consulta por
      comentario
- [ ] Filtrar tareas por etiqueta devuelve las correctas
- [ ] Un no miembro recibe 404 en todas estas rutas

### Documentación
- [ ] `docs/adr/0008-activity-log.md` — por qué la bitácora se escribe en la
      misma transacción, y cómo se conecta con los webhooks de la Fase 4
- [ ] README con los endpoints nuevos
- [ ] `docs/DEBT.md` revisado

---

## Fuera de alcance

- Menciones a usuarios en comentarios y sus notificaciones
- Reacciones a comentarios, hilos o respuestas anidadas
- Adjuntos en comentarios
- Bitácora a nivel de proyecto u organización: por ahora solo de tarea
- Webhooks y API keys (Fase 4)
- Envío de correos (Fase 4)

---

## Criterio de cierre

1. Sin archivo `.env`, con el stack levantado:
   `pnpm install && pnpm test && pnpm typecheck && pnpm lint` pasa entero
2. `docker compose build api` y `docker compose up -d --force-recreate -V api`
   dejan todo `healthy`
3. Los dos checks del CI en verde en el Pull Request
4. Recorrido manual: crear tarea, comentarla, editar el comentario y ver
   `editedAt`, crear dos etiquetas y aplicarlas, filtrar tareas por etiqueta,
   cambiar estado y prioridad, y consultar la bitácora viendo cada cambio con
   su valor anterior
5. Ningún listado dispara una consulta por elemento

Cumplido eso: Pull Request, checks verdes, merge con commit de merge, y tag
`v0.5.0`.
