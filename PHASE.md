# Fase actual: 1 — Identidad

**Objetivo:** usuarios, organizaciones y el ciclo completo de autenticación con
refresh token rotativo. Al terminar, un usuario puede registrarse, iniciar
sesión, renovar su sesión, cerrarla, y consultar su perfil y sus
organizaciones.

**Rama:** `feat/identity-and-auth`
**Tag al cerrar:** `v0.2.0`

---

## Decisiones ya tomadas

Estas no se discuten durante la fase. Están cerradas y el código debe
reflejarlas:

1. **El access token identifica solo al usuario.** No lleva organización ni
   permisos. El alcance por organización se resuelve por la ruta
   (`/v1/organizations/:organizationId/...`) a partir de la Fase 3, validando
   la membresía en cada petición. Esto evita tener que reemitir tokens cuando
   el usuario cambia de organización.

2. **Access token JWT de 15 minutos.** Firmado HS256 con secreto de
   configuración. Claims: `sub`, `jti`, `iat`, `exp`, `iss`, `aud`.

3. **Refresh token opaco, no JWT.** Cadena aleatoria de 256 bits. En la base se
   guarda solo su hash SHA-256, nunca el valor. Vida de 30 días. Viaja en
   cookie `httpOnly`, `secure` en producción, `sameSite` configurable.

4. **Rotación con detección de reutilización.** Cada uso del refresh token lo
   revoca y emite uno nuevo dentro de la misma familia. Si se presenta un token
   ya revocado, se revoca **toda la familia** y se registra el evento: eso
   significa que el token fue robado.

5. **Argon2id** para contraseñas. Nunca bcrypt.

6. **Registro crea usuario, organización personal y membresía** en una sola
   transacción. Un usuario siempre pertenece al menos a una organización.

7. **La membresía no tiene rol todavía.** Los roles y permisos llegan en la
   Fase 2. En esta fase la tabla de membresía solo relaciona usuario y
   organización.

8. **Prefijo `/v1` en todas las rutas** desde ahora.

9. **Respuestas de error indistinguibles en login.** Correo inexistente y
   contraseña incorrecta devuelven exactamente el mismo error y en tiempos
   comparables. No revelar si un correo está registrado.

10. **Política de contraseña:** mínimo 12 caracteres, máximo 128. Sin reglas de
    complejidad obligatoria, siguiendo la guía actual del NIST.

---

## Alcance

### Modelo de datos
- [ ] `User`: id, email (único, normalizado a minúsculas), passwordHash, name,
      emailVerifiedAt (nullable, sin usar todavía), createdAt, updatedAt,
      deletedAt
- [ ] `Organization`: id, name, slug (único), createdAt, updatedAt, deletedAt
- [ ] `Membership`: userId, organizationId, joinedAt. Único por par
- [ ] `RefreshToken`: id, userId, tokenHash, familyId, expiresAt, revokedAt,
      replacedById, createdAt, userAgent, ipAddress
- [ ] Índices en los campos por los que se consulta: email, slug, tokenHash,
      familyId
- [ ] Migración generada y aplicada. Borrar la migración vacía de la Fase 0

### Módulo auth
- [ ] `POST /v1/auth/register` — crea usuario, organización personal y
      membresía en una transacción; devuelve tokens
- [ ] `POST /v1/auth/login` — valida credenciales y emite tokens
- [ ] `POST /v1/auth/refresh` — rota el refresh token con detección de reuso
- [ ] `POST /v1/auth/logout` — revoca el refresh token actual
- [ ] `POST /v1/auth/logout-all` — revoca todos los del usuario
- [ ] `GET /v1/auth/me` — perfil del usuario autenticado
- [ ] Middleware `requireAuth` que valida el access token y deja el id de
      usuario en el contexto de la petición
- [ ] Límite de intentos en register, login y refresh

### Módulo users
- [ ] Repositorio y servicio de usuarios
- [ ] `PATCH /v1/users/me` — actualizar nombre
- [ ] `POST /v1/users/me/password` — cambiar contraseña; revoca todas las
      sesiones activas excepto la actual

### Módulo organizations
- [ ] `POST /v1/organizations` — crear organización; el creador queda como
      miembro
- [ ] `GET /v1/organizations` — organizaciones del usuario autenticado
- [ ] `GET /v1/organizations/:id` — solo si el usuario es miembro; si no, 404
      (no 403, para no filtrar existencia)

### Contratos
- [ ] Esquemas Zod de todas las entradas y salidas en `packages/contracts`
- [ ] La API los consume; no hay esquemas duplicados en `apps/api`

### Tests
- [ ] Registro con correo duplicado devuelve conflicto
- [ ] Login con credenciales inválidas devuelve el mismo error que con correo
      inexistente
- [ ] Access token expirado es rechazado
- [ ] Refresh rota el token y el anterior deja de servir
- [ ] **Reutilizar un refresh token revocado revoca toda la familia**
- [ ] Logout invalida el refresh token
- [ ] Cambiar contraseña revoca las demás sesiones
- [ ] Un usuario no puede ver una organización de la que no es miembro
- [ ] La contraseña nunca aparece en ninguna respuesta ni en los logs

### Documentación
- [ ] `docs/adr/0003-refresh-token-rotation.md`
- [ ] `docs/adr/0004-password-hashing.md`
- [ ] README actualizado con los endpoints disponibles

---

## Fuera de alcance

No implementar, aunque parezca el siguiente paso natural:

- Roles y permisos (Fase 2)
- Invitaciones a organizaciones (Fase 2)
- Verificación de correo y recuperación de contraseña — requieren la cola, que
  llega en la Fase 4. El campo `emailVerifiedAt` se crea pero no se usa
- Proyectos, tareas, comentarios, etiquetas (Fase 3)
- Webhooks y API keys (Fase 4)
- CI, despliegue, OpenAPI publicado (Fases 5 y 6)
- Autenticación con proveedores externos (OAuth, Google) — no está en el
  alcance del proyecto

---

## Criterio de cierre

Sobre un **clon limpio**, sin pasos manuales fuera de los listados:

1. `pnpm install && cp .env.example .env && docker compose up -d --build`
2. `pnpm test` pasa en verde, incluidos los tests de rotación y reuso
3. `pnpm typecheck` y `pnpm lint` sin errores
4. Un recorrido manual completo funciona: registrar, iniciar sesión, llamar a
   `/v1/auth/me`, renovar, volver a llamar a `/v1/auth/me` con el token nuevo,
   cerrar sesión, y confirmar que el token viejo ya no sirve
5. Reutilizar un refresh token ya rotado invalida toda la familia
6. Ninguna respuesta expone `passwordHash` ni el valor del refresh token

**Verificación obligatoria de clon limpio** — esto falló en la Fase 0 y no
puede repetirse:

```
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
pnpm test && pnpm typecheck && pnpm lint
```

Los tres deben pasar sin ejecutar ningún comando adicional.

Cumplido eso: Pull Request, merge con commit de merge, y tag `v0.2.0`.
