# Fase actual: 2 — Roles, permisos e invitaciones

**Objetivo:** que una organización deje de ser de una sola persona. Roles con
permisos granulares, gestión de miembros, e invitaciones por correo.

**Rama:** `feat/roles-and-invitations`
**Tag al cerrar:** `v0.3.0`

---

## Decisiones ya tomadas

No se discuten. El código debe reflejarlas tal cual.

1. **Cuatro roles fijos, no configurables por el usuario:** `OWNER`, `ADMIN`,
   `MEMBER`, `VIEWER`. Se guardan como enum en la membresía. No hay creación de
   roles a medida: es una funcionalidad grande que no aporta a este proyecto.

2. **La matriz de permisos vive en el código, no en la base.** Un único módulo
   tipado mapea rol a lista de permisos. Razón: los permisos cambian con cada
   despliegue, no en caliente, y una matriz en código se revisa en un Pull
   Request y se testea. Evita además un join en cada petición.

3. **Los permisos se nombran `recurso:accion` y, cuando el alcance importa,
   `recurso:accion:alcance`.** Ejemplos: `organization:update`,
   `member:invite`, `member:remove:any`. El sufijo de alcance prepara el
   terreno para la Fase 3, donde aparece la distinción entre lo propio y lo
   ajeno.

4. **Toda organización tiene exactamente un OWNER, siempre.** No se puede
   eliminar al último owner, ni degradarlo, ni puede abandonar la organización.
   Para salir, primero transfiere la propiedad.

5. **Las rutas de organización llevan el id en el path:**
   `/v1/organizations/:organizationId/...`. La membresía y el rol se resuelven
   ahí, en cada petición. El access token sigue sin llevar organización, como
   se decidió en la Fase 1.

6. **A un no miembro se le responde 404, nunca 403.** Coherente con la Fase 1:
   no revelar qué organizaciones existen.

7. **La invitación se identifica con un token opaco**, guardado hasheado, con
   vencimiento de 7 días, de un solo uso.

8. **El envío de correo queda para la Fase 4.** Como la cola no existe todavía,
   el endpoint de invitación devuelve el enlace en la respuesta. Es una medida
   temporal y debe quedar marcada como tal en el código y en `docs/DEBT.md`.

9. **Una invitación se acepta solo con la cuenta del correo invitado.** Si
   quien la acepta tiene otro correo, se rechaza. Si el correo invitado no
   tiene cuenta, la invitación queda pendiente hasta que se registre.

10. **La migración debe rellenar los datos existentes:** todas las membresías
    creadas en la Fase 1 pasan a `OWNER`, porque son organizaciones personales.

---

## Alcance

### Modelo de datos
- [ ] Enum de rol y campo `role` en `Membership`, con migración que rellena
      `OWNER` en las filas existentes
- [ ] `Invitation`: id, organizationId, email, role, tokenHash, invitedById,
      expiresAt, acceptedAt, revokedAt, createdAt
- [ ] Índice único parcial: no puede haber dos invitaciones pendientes para el
      mismo correo en la misma organización
- [ ] Índices en tokenHash y en el par organizationId + email

### Permisos
- [ ] Módulo de permisos con la matriz rol → permisos, tipada y exportada
- [ ] Middleware `requireMembership` que resuelve organización, membresía y rol
      desde el path, y los deja en el contexto de la petición
- [ ] Middleware `requirePermission` que verifica contra la matriz
- [ ] El reparto sugerido, ajustable con criterio: `OWNER` todo, incluida
      eliminar la organización y transferir propiedad; `ADMIN` gestiona
      miembros e invitaciones y edita la organización; `MEMBER` lee y opera
      sobre el contenido; `VIEWER` solo lee

### Miembros
- [ ] `GET /v1/organizations/:organizationId/members`
- [ ] `PATCH /v1/organizations/:organizationId/members/:userId` — cambiar rol
- [ ] `DELETE /v1/organizations/:organizationId/members/:userId` — expulsar
- [ ] `DELETE /v1/organizations/:organizationId/members/me` — abandonar
- [ ] `POST /v1/organizations/:organizationId/transfer-ownership`

### Invitaciones
- [ ] `POST /v1/organizations/:organizationId/invitations` — crear
- [ ] `GET /v1/organizations/:organizationId/invitations` — listar pendientes
- [ ] `DELETE /v1/organizations/:organizationId/invitations/:id` — revocar
- [ ] `GET /v1/invitations/:token` — vista previa: nombre de la organización,
      quién invita y el rol ofrecido. Sin exponer nada más
- [ ] `POST /v1/invitations/:token/accept` — aceptar, autenticado

### Organizaciones
- [ ] `PATCH /v1/organizations/:organizationId` — editar, con permiso
- [ ] `DELETE /v1/organizations/:organizationId` — solo `OWNER`

### Tests
- [ ] Un test por rol que recorre la matriz completa y comprueba qué puede y
      qué no puede hacer cada uno
- [ ] No se puede degradar ni expulsar al último `OWNER`
- [ ] El `OWNER` no puede abandonar la organización sin transferir antes
- [ ] Un `ADMIN` no puede modificar a un `OWNER`
- [ ] Invitación vencida, ya usada y revocada: las tres rechazadas
- [ ] Aceptar con un correo distinto al invitado es rechazado
- [ ] Invitar a alguien que ya es miembro devuelve conflicto
- [ ] Un no miembro recibe 404 en todas las rutas de la organización
- [ ] Las membresías de la Fase 1 quedan como `OWNER` tras la migración

### Documentación
- [ ] `docs/adr/0005-permission-matrix.md` — por qué la matriz en código y no
      en la base
- [ ] README actualizado con los endpoints y la tabla de roles
- [ ] `docs/DEBT.md` — anotar que el enlace de invitación se devuelve en la
      respuesta hasta que exista el envío de correo

---

## Fuera de alcance

- Envío real de correos, cola y worker (Fase 4)
- Proyectos, tareas, comentarios, etiquetas (Fase 3)
- Roles a medida definidos por el usuario
- Permisos por proyecto o por recurso individual
- Registro de auditoría de cambios de rol
- Webhooks y API keys (Fase 4)

---

## Criterio de cierre

1. Sin archivo `.env`: `pnpm install && pnpm test && pnpm typecheck && pnpm
   lint` pasa entero
2. `docker compose build api` y `docker compose up -d` dejan todo `healthy`
3. La migración corre sobre una base con datos de la Fase 1 y las membresías
   existentes quedan como `OWNER`
4. Los dos checks del CI en verde en el Pull Request
5. Recorrido manual: crear organización, invitar a un segundo usuario como
   `MEMBER`, aceptar, comprobar que ese usuario no puede expulsar a nadie,
   ascenderlo a `ADMIN`, comprobar que ahora sí puede invitar pero no puede
   tocar al `OWNER`

Cumplido eso: Pull Request, checks verdes, merge con commit de merge, y tag
`v0.3.0`.
