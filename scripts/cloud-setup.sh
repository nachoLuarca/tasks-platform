#!/usr/bin/env bash
# Deja un entorno cloud (Linux, sin Docker) listo para correr `pnpm test`:
# Node 24, pnpm, PostgreSQL, Redis, Mailpit, dependencias y migraciones.
# Es idempotente: se puede ejecutar las veces que haga falta.
# Uso: source scripts/cloud-setup.sh   (exporta PATH con Node 24 a la shell actual)
#  o:  bash scripts/cloud-setup.sh     (el PATH lo resuelve ~/.cloud-setup-env)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_USER=tasks_platform
DB_PASS=tasks_platform
DB_NAME=tasks_platform
NODE_MAJOR=24
PNPM_VERSION=11.25.0
TOOLS_DIR="${CLOUD_SETUP_TOOLS_DIR:-$HOME/.cache/cloud-setup}"
ENV_FILE="$HOME/.cloud-setup-env"
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

log() { printf '\n==> %s\n' "$*"; }

# --- Node 24 (el repo exige >=24; se baja el binario oficial, sin tocar el Node del sistema)
install_node() {
  local current
  current="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$current" -ge "$NODE_MAJOR" ]; then return; fi
  log "Instalando Node $NODE_MAJOR"
  local dir="$TOOLS_DIR/node"
  if [ ! -x "$dir/bin/node" ]; then
    local version
    version="$(curl -fsSL https://nodejs.org/dist/index.json |
      grep -oE "\"version\":\"v${NODE_MAJOR}\.[0-9]+\.[0-9]+\"" | head -1 | cut -d'"' -f4)"
    mkdir -p "$dir"
    curl -fsSL "https://nodejs.org/dist/${version}/node-${version}-linux-x64.tar.xz" |
      tar -xJ -C "$dir" --strip-components=1
  fi
  export PATH="$dir/bin:$PATH"
}

install_pnpm() {
  if [ "$(pnpm -v 2>/dev/null || true)" != "$PNPM_VERSION" ]; then
    log "Instalando pnpm $PNPM_VERSION"
    npm install -g "pnpm@$PNPM_VERSION" >/dev/null
  fi
}

# --- PostgreSQL y Redis desde apt
install_services() {
  if command -v psql >/dev/null && command -v redis-server >/dev/null &&
    ls /usr/lib/postgresql/*/bin/pg_ctl >/dev/null 2>&1; then
    return
  fi
  log "Instalando PostgreSQL y Redis"
  $SUDO apt-get update -qq
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq postgresql redis-server >/dev/null
}

start_postgres() {
  log "Levantando PostgreSQL"
  local bin
  bin="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
  if ! "$bin/pg_isready" -q 2>/dev/null; then
    local conf
    conf="$(ls -d /etc/postgresql/*/main 2>/dev/null | sort -V | tail -1 || true)"
    if command -v pg_ctlcluster >/dev/null && [ -n "$conf" ]; then
      $SUDO pg_ctlcluster "$(basename "$(dirname "$conf")")" main start || true
    else
      $SUDO service postgresql start || true
    fi
    for _ in $(seq 1 30); do "$bin/pg_isready" -q && break; sleep 1; done
  fi
  "$bin/pg_isready" -q || { echo "PostgreSQL no arrancó" >&2; exit 1; }

  local psql_admin="$SUDO -u postgres psql -qtAX"
  [ -z "$SUDO" ] && psql_admin="runuser -u postgres -- psql -qtAX"
  if [ -z "$($psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")" ]; then
    # SUPERUSER: Prisma migrate necesita crear extensiones y una shadow DB.
    $psql_admin -c "CREATE ROLE $DB_USER LOGIN SUPERUSER PASSWORD '$DB_PASS'"
  fi
  if [ -z "$($psql_admin -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")" ]; then
    $psql_admin -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
  fi
}

start_redis() {
  log "Levantando Redis"
  if ! redis-cli ping >/dev/null 2>&1; then
    redis-server --daemonize yes --save "" --appendonly no >/dev/null
    for _ in $(seq 1 15); do redis-cli ping >/dev/null 2>&1 && break; sleep 1; done
  fi
  redis-cli ping >/dev/null
}

# --- Mailpit: los tests del worker leen correo real vía SMTP 1025 / API 8025
start_mailpit() {
  log "Levantando Mailpit"
  if curl -fs http://localhost:8025/readyz >/dev/null 2>&1; then return; fi
  local bin="$TOOLS_DIR/mailpit/mailpit"
  if [ ! -x "$bin" ]; then
    mkdir -p "$TOOLS_DIR/mailpit"
    curl -fsSL https://github.com/axllent/mailpit/releases/latest/download/mailpit-linux-amd64.tar.gz |
      tar -xz -C "$TOOLS_DIR/mailpit" mailpit
  fi
  nohup "$bin" >"$TOOLS_DIR/mailpit/mailpit.log" 2>&1 &
  for _ in $(seq 1 15); do curl -fs http://localhost:8025/readyz >/dev/null 2>&1 && return; sleep 1; done
  echo "Mailpit no arrancó" >&2
  exit 1
}

mkdir -p "$TOOLS_DIR"
install_node
install_pnpm
install_services
start_postgres
start_redis
start_mailpit

export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public"
export REDIS_URL="redis://localhost:6379"

log "Instalando dependencias"
pnpm install --frozen-lockfile

log "Aplicando migraciones"
pnpm --filter @tasks-platform/api run db:migrate:deploy

# Guarda el PATH con Node 24 para shells posteriores (`source ~/.cloud-setup-env`).
echo "export PATH=\"$(dirname "$(command -v node)"):\$PATH\"" >"$ENV_FILE"

log "Listo. Ejecuta: source ~/.cloud-setup-env && pnpm test"
