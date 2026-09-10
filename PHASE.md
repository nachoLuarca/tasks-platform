# Fase actual: 4.5 — Cuenta y credenciales

**Objetivo:** cerrar tres huecos que quedaron abiertos en fases anteriores.
Verificación de correo, recuperación de contraseña, y API keys que puedan
escribir y no solo leer.

**Rama:** `feat/email-verification-and-key-scopes`
**Tag al cerrar:** `v0.7.0`

Fase corta. Ahora que el worker envía correo de verdad, estas tres cosas ya no
tienen excusa para seguir pendientes.

---

## Decisiones ya tomadas

1. **La verificación de correo no bloquea el acceso.** Un usuario sin verificar
   usa la API con normalidad; el estado se expone en su perfil para que un
   cliente pueda mostrar un aviso. Bloquear el acceso es una decisión de
   producto que además rompería el usuario de demostración de la Fase 7.
   Queda documentado como decisión, no como olvido.

2. **Aceptar una invitación verifica el correo automáticamente.** Quien acepta
   recibió el enlace en esa dirección: exigirle una verificación adicional
   sobra.

3. **Recuperar la contraseña nunca revela si un correo existe.** La solicitud
   responde siempre igual, exista o no la cuenta, y en tiempos comparables.
   Es el mismo criterio que ya usa el login.

4. **Restablecer la contraseña cierra todas las sesiones.** Si alguien llegó
   ahí porque le robaron la cuenta, dejar sesiones vivas anularía el propósito.
   A diferencia del cambio de contraseña normal, aquí no se conserva ninguna.

5. **Los tokens de verificación y de recuperación son opacos**, guardados
   hasheados, de un solo uso. Verificación: 24 horas. Recuperación: 1 hora, más
   corta porque el riesgo es mayor.

6. **Una API key no tiene recursos propios.** El concepto de "propiedad" que
   usan los permisos `:own` no aplica a una credencial de máquina: no es autor
   ni responsable de nada. Por eso los scopes de escritura de una key usan
   siempre las variantes `:any`, dentro del alcance de su organización.

7. **La bitácora ya distingue el actor**, así que una tarea creada por una API
   key queda registrada como tal y no atribuida a la persona que creó la key.

---

## Alcance

### Modelo de datos
- [ ] `VerificationToken`: id, userId, tokenHash, expiresAt, usedAt, createdAt
- [ ] `PasswordResetToken`: id, userId, tokenHash, expiresAt, usedAt, createdAt
- [ ] Índices en tokenHash y userId

### Verificación de correo
- [ ] Al registrarse se encola el correo de verificación
- [ ] `POST /v1/auth/verify-email` — consume el token
- [ ] `POST /v1/auth/resend-verification` — autenticado, con límite de
      intentos
- [ ] Aceptar una invitación marca el correo como verificado
- [ ] `GET /v1/auth/me` expone el estado de verificación
- [ ] Cambiar el correo, si existiera esa vía, lo devuelve a no verificado

### Recuperación de contraseña
- [ ] `POST /v1/auth/forgot-password` — respuesta idéntica exista o no la
      cuenta, con límite de intentos por correo y por IP
- [ ] `POST /v1/auth/reset-password` — consume el token, cambia la contraseña
      y revoca todas las sesiones
- [ ] `GET /v1/auth/reset-password/:token` — verifica si el token sigue siendo
      válido, sin consumirlo, para que un cliente pueda avisar antes de pedir
      la contraseña nueva

### Correos
- [ ] Plantilla de verificación, en texto plano y HTML
- [ ] Plantilla de recuperación, en texto plano y HTML
- [ ] Ambas por el worker, contra Mailpit en desarrollo

### API keys de escritura
- [ ] Ampliar el catálogo de scopes con las variantes de escritura:
      creación y modificación de tareas, proyectos, comentarios y etiquetas,
      usando siempre `:any`
- [ ] Al crear una key se valida que los scopes pedidos existan
- [ ] Una key solo puede recibir scopes que quien la crea posee: un `ADMIN` no
      puede fabricar una key con permisos de `OWNER`
- [ ] La bitácora registra la key como actor en las escrituras que haga

### Tests
- [ ] Solicitar recuperación con un correo inexistente responde igual que con
      uno real
- [ ] Un token de recuperación usado no sirve dos veces
- [ ] Un token vencido es rechazado
- [ ] Restablecer la contraseña invalida todas las sesiones previas
- [ ] El correo de verificación llega a Mailpit con un enlace que funciona
- [ ] Aceptar una invitación deja el correo verificado
- [ ] Una key con scope de escritura crea una tarea, y la bitácora la registra
      como actor
- [ ] Una key sin ese scope recibe 403
- [ ] Un `ADMIN` no puede crear una key con scopes que él no tiene
- [ ] Reenviar la verificación demasiadas veces devuelve 429

### Documentación
- [ ] `docs/adr/0011-account-recovery.md` — por qué la respuesta uniforme, por
      qué se revocan todas las sesiones, y por qué la verificación no bloquea
      el acceso
- [ ] README con los endpoints nuevos y el catálogo completo de scopes
- [ ] `docs/DEBT.md` revisado

---

## Fuera de alcance

- Segundo factor de autenticación
- Inicio de sesión con proveedores externos
- Cambio de dirección de correo del usuario
- Rotación de API keys
- Límites de uso por API key
- Cualquier bloqueo de funcionalidad por correo sin verificar

---

## Criterio de cierre

1. Sin archivo `.env`, con el stack levantado:
   `pnpm install && pnpm test && pnpm typecheck && pnpm lint` pasa entero
2. `docker compose up -d --build` deja los cinco servicios `healthy`
3. Los dos checks del CI en verde en el Pull Request
4. Recorrido manual: registrarse y ver el correo de verificación en Mailpit,
   verificar, pedir recuperación con un correo inexistente y comprobar que la
   respuesta es idéntica, recuperar con uno real y confirmar que la sesión
   anterior dejó de servir, y crear una API key de escritura que cree una tarea
   registrada a su nombre en la bitácora

Cumplido eso: Pull Request, checks verdes, merge con commit de merge, y tag
`v0.7.0`.
