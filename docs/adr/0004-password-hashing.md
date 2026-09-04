# 0004 — Argon2id sobre bcrypt para el hash de contraseñas

## Contexto

`ARCHITECTURE.md` ya fija Argon2id como la tecnologia de hashing del stack.
Este ADR documenta el porque, ya que bcrypt es la alternativa mas conocida y
todavia ampliamente usada.

## Decision

Las contraseñas se hashean con Argon2id, usando los parametros de costo
definidos en `ARGON2_MEMORY_COST_KIB`, `ARGON2_TIME_COST` y
`ARGON2_PARALLELISM` (ver `.env.example`), con valores por defecto que siguen
el minimo recomendado por OWASP para un servidor de 1-2 vCPU.

## Alternativas consideradas

- **bcrypt.** El estandar de facto durante mucho tiempo.
- **scrypt.** Tambien resistente a hardware dedicado, menos usado en
  practica y con una API menos difundida en el ecosistema Node.

## Por que Argon2id y no bcrypt

- **Costo de memoria configurable.** Bcrypt solo permite ajustar el costo
  computacional (numero de rondas); Argon2 permite ademas fijar cuanta
  memoria requiere cada intento. Esto es lo que lo hace caro de atacar con
  hardware especializado (GPU/ASIC), que es barato en computo pero no en
  memoria dedicada por hilo paralelo.
- **Ganador del Password Hashing Competition (2015)**, diseñado
  especificamente para reemplazar a bcrypt/scrypt con las lecciones
  aprendidas de ambos.
- **Variante `id`, no `i` ni `d`.** Argon2i esta pensado para resistir
  ataques de canal lateral (side-channel) a costa de ser algo mas debil
  contra ataques de fuerza bruta con GPU; Argon2d es al reves. Argon2id es un
  hibrido pensado como opcion por defecto razonable para hashing de
  contraseñas en un servidor: no hay razon para elegir uno de los extremos.
- **Limite de 128 caracteres, no 72.** Bcrypt trunca (o directamente
  rechaza, segun la implementacion) contraseñas de mas de 72 bytes; Argon2 no
  tiene ese limite practico, lo que evita una restriccion arbitraria que
  ademas sorprende a quien no la conoce.

## Consecuencias

- `argon2` (el paquete `node-argon2`) requiere un binario nativo compilado en
  la instalacion (`pnpm approve-builds`), a diferencia de una implementacion
  pura en JavaScript. Ya esta resuelto en `pnpm-workspace.yaml`
  (`onlyBuiltDependencies`), y el Dockerfile de la API instala las
  dependencias del sistema que ese binario necesita.
- Los parametros de costo son configurables por variable de entorno
  especificamente para poder bajarlos en los tests de integracion (que
  hashean contraseñas repetidamente) sin bajarlos en produccion.
- Verificar una contraseña contra un hash de un usuario que no existe usa un
  hash "señuelo" precalculado con los mismos parametros de costo
  (`dummyPasswordHash` en `shared/security/password.ts`), para que el tiempo
  de respuesta de login no revele si un correo esta registrado.
