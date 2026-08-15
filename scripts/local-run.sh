#!/usr/bin/env bash
# IELTS Writing Coach — one-command local run (no Docker).
#
# Usage:
#   ./scripts/local-run.sh          start everything and run web + worker in the foreground
#   ./scripts/local-run.sh --stop   stop the project-local PostgreSQL cluster
#   ./scripts/local-run.sh --clean  stop and delete all local run state (database included)
#   ./scripts/local-run.sh --help   show this help
#
# Prerequisites (auto-detected, installed by Homebrew if you have it):
#   - Node.js >= 24.14            (keg-only "node@24" is found automatically)
#   - pnpm 11.16                  (resolved via corepack, matching package.json)
#   - PostgreSQL 17 binaries      (keg-only "postgresql@17" is found automatically)
#   - OpenSSL
#
# All state lives in .local-run/ inside the repository (gitignored):
#   .local-run/pgdata        project-local PostgreSQL 17 cluster
#   .local-run/secrets.env   generated auth/encryption/setup secrets
#   .local-run/postgres.log  database log
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$REPO_ROOT/.local-run"
PGDATA="$RUN_DIR/pgdata"
SECRETS="$RUN_DIR/secrets.env"
SEED_MARKER="$RUN_DIR/seeded"
PG_LOG="$RUN_DIR/postgres.log"
DEFAULT_PG_PORT="${IWC_PG_PORT:-5433}"
MAX_PORT_SCAN=12
APP_PORT="${IWC_APP_PORT:-3000}"

GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; BOLD=$'\033[1m'; RESET=$'\033[0m'

ok()   { printf '%s[ok]%s %s\n'   "$GREEN" "$RESET" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()  { printf '%s[error]%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

usage() {
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
}

# --- tool discovery -------------------------------------------------------

node_satisfies() { # $1: node binary
  "$1" -e 'const v=process.versions.node.split(".").map(Number);const [mj,mn,pt]=[24,14,0];process.exit(v[0]>mj||(v[0]===mj&&(v[1]>mn||(v[1]===mn&&v[2]>=pt)))?0:1)' >/dev/null 2>&1
}

resolve_node() {
  local candidates=() c
  [ -n "${IWC_NODE_BIN:-}" ] && candidates+=("$IWC_NODE_BIN")
  candidates+=(
    "/opt/homebrew/opt/node@24/bin/node"
    "/usr/local/opt/node@24/bin/node"
  )
  command -v node >/dev/null 2>&1 && candidates+=("$(command -v node)")
  for c in "${candidates[@]}"; do
    [ -x "$c" ] || continue
    if node_satisfies "$c"; then
      NODE="$c"; NODE_DIR="$(dirname "$c")"; return 0
    fi
  done
  die "Node.js >= 24.14 not found. Install with: brew install node@24"
}

resolve_pnpm() {
  if [ -x "$NODE_DIR/pnpm" ]; then
    PNPM="$NODE_DIR/pnpm"
  elif command -v pnpm >/dev/null 2>&1; then
    PNPM="$(command -v pnpm)"
  else
    "$NODE_DIR/corepack" enable --install-directory "$NODE_DIR" >/dev/null 2>&1 || true
    PNPM="$NODE_DIR/pnpm"
  fi
}

resolve_pg() {
  local dirs=() d major
  [ -n "${IWC_PGBIN:-}" ] && dirs+=("$IWC_PGBIN")
  dirs+=(
    "/opt/homebrew/opt/postgresql@17/bin"
    "/usr/local/opt/postgresql@17/bin"
  )
  command -v initdb >/dev/null 2>&1 && dirs+=("$(dirname "$(command -v initdb)")")
  for d in "${dirs[@]}"; do
    for bin in initdb pg_ctl psql pg_isready createdb; do [ -x "$d/$bin" ] || continue 2; done
    major="$("$d/initdb" --version | grep -oE '[0-9]+' | head -1)"
    [ "$major" = "17" ] || continue
    PGBIN="$d"; return 0
  done
  die "PostgreSQL 17 binaries not found. Install with: brew install postgresql@17"
}

# --- helpers --------------------------------------------------------------

port_is_free() {
  if command -v nc >/dev/null 2>&1; then
    ! nc -z -G 1 127.0.0.1 "$1" >/dev/null 2>&1
  else
    ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
  fi
}

pick_port() {
  local p
  for ((p = DEFAULT_PG_PORT; p < DEFAULT_PG_PORT + MAX_PORT_SCAN; p++)); do
    if port_is_free "$p"; then printf '%s' "$p"; return 0; fi
  done
  die "No free port between $DEFAULT_PG_PORT and $((DEFAULT_PG_PORT + MAX_PORT_SCAN - 1))"
}

pg_running() {
  "$PGBIN/pg_isready" -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1
}

load_secrets() { # shellcheck disable=SC1090
  . "$SECRETS"
  export DATABASE_URL AUTH_SECRET APP_ENCRYPTION_KEY SETUP_TOKEN \
    APP_URL TRUSTED_ORIGINS
}

write_secrets() {
  cat > "$SECRETS" <<EOF
DB_PORT=$DB_PORT
PG_PASSWORD=$PG_PASSWORD
DATABASE_URL=postgresql://iwc:$PG_PASSWORD@127.0.0.1:$DB_PORT/iwc
AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
APP_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')
SETUP_TOKEN=$(openssl rand -base64 24 | tr -d '\n')
APP_URL=http://127.0.0.1:$APP_PORT
TRUSTED_ORIGINS=http://127.0.0.1:$APP_PORT,http://localhost:$APP_PORT
EOF
  chmod 600 "$SECRETS"
}

# Older .local-run state files predate APP_URL/TRUSTED_ORIGINS. Add the
# defaults so browsers opened through localhost or 127.0.0.1 both pass the
# trusted-origin check.
ensure_origin_secrets() {
  if ! grep -q '^APP_URL=' "$SECRETS" 2>/dev/null; then
    printf 'APP_URL=http://127.0.0.1:%s\n' "$APP_PORT" >> "$SECRETS"
  fi
  if ! grep -q '^TRUSTED_ORIGINS=' "$SECRETS" 2>/dev/null; then
    printf 'TRUSTED_ORIGINS=http://127.0.0.1:%s,http://localhost:%s\n' \
      "$APP_PORT" "$APP_PORT" >> "$SECRETS"
  fi
}

# --- setup ----------------------------------------------------------------

init_cluster() {
  local pwfile="$RUN_DIR/pwfile"
  mkdir -p "$RUN_DIR"
  DB_PORT="$(pick_port)"
  PG_PASSWORD="$(openssl rand -hex 24 | tr -d '\n')"
  printf '%s' "$PG_PASSWORD" > "$pwfile"
  "$PGBIN/initdb" -D "$PGDATA" -U iwc -E UTF8 --locale=C \
    -A scram-sha-256 --pwfile="$pwfile" >/dev/null
  rm -f "$pwfile"
  chmod 700 "$PGDATA"
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "port = $DB_PORT"
    echo "unix_socket_directories = '$RUN_DIR'"
  } >> "$PGDATA/postgresql.conf"
  write_secrets
  ok "initialized project-local PostgreSQL 17 cluster (port $DB_PORT)"
}

ensure_postgres() {
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    init_cluster
  else
    load_secrets
  fi
  if ! pg_running; then
    "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PG_LOG" -w -t 30 start >/dev/null
    ok "started PostgreSQL 17 on 127.0.0.1:$DB_PORT"
  fi
  export PGPASSWORD="$PG_PASSWORD"
  if ! "$PGBIN/psql" -h 127.0.0.1 -p "$DB_PORT" -U iwc -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = 'iwc'" | grep -q 1; then
    "$PGBIN/createdb" -h 127.0.0.1 -p "$DB_PORT" -U iwc iwc
    ok "created database 'iwc'"
  fi
  load_secrets
}

# --- commands -------------------------------------------------------------

cmd_start() {
  command -v openssl >/dev/null 2>&1 || die "OpenSSL not found. Install with: brew install openssl"
  resolve_node
  resolve_pnpm
  resolve_pg
  ensure_postgres
  ensure_origin_secrets
  load_secrets

  export PATH="$NODE_DIR:$PATH"
  cd "$REPO_ROOT"

  if [ ! -f node_modules/.modules.yaml ]; then
    "$PNPM" install --frozen-lockfile
  fi
  "$PNPM" db:migrate
  if [ ! -f "$SEED_MARKER" ]; then
    "$PNPM" db:seed
    touch "$SEED_MARKER"
  fi

  printf '\n%sIELTS Writing Coach is starting%s\n' "$BOLD" "$RESET"
  printf '  Web app:    %shttp://127.0.0.1:%s%s\n' "$GREEN" "$APP_PORT" "$RESET"
  printf '  One-time setup: %shttp://127.0.0.1:%s/setup?token=%s%s\n' "$GREEN" "$APP_PORT" "$SETUP_TOKEN" "$RESET"
  printf '  Press Ctrl+C to stop the servers (PostgreSQL keeps running).\n'
  printf '  Stop PostgreSQL with: scripts/local-run.sh --stop\n\n'

  trap 'warn "web + worker stopped; PostgreSQL still running (scripts/local-run.sh --stop to stop it)"; exit 130' INT
  "$PNPM" dev
  exit $?
}

cmd_stop() {
  [ -f "$SECRETS" ] || { warn "nothing to stop (.local-run/ not initialized)"; exit 0; }
  load_secrets
  if pg_running; then
    "$PGBIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null
    ok "stopped PostgreSQL 17 (port $DB_PORT)"
  else
    warn "PostgreSQL was not running"
  fi
}

cmd_clean() {
  cmd_stop || true
  rm -rf "$RUN_DIR"
  ok "removed $RUN_DIR (all local run state deleted)"
}

case "${1:-start}" in
  --help | -h) usage; exit 0 ;;
  --stop) resolve_pg; cmd_stop; exit 0 ;;
  --clean) resolve_pg; cmd_clean; exit 0 ;;
  start | run) cmd_start ;;
  *) die "unknown command: $1 (see scripts/local-run.sh --help)" ;;
esac
