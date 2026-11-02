#!/usr/bin/env bash
# Starts everything for testing Janus by hand on this machine, in real-account mode:
# Postgres (Docker), the database migrations, the API, the worker and the web app.
# Ctrl+C stops the API, the worker and the web app; Postgres keeps running (stop it with
# `docker compose -f backend/docker-compose.yml stop postgres`).
#
#   scripts/dev-up.sh            web app on http://localhost:3000
#   WEB_PORT=3011 scripts/dev-up.sh
#
# Needs Docker, uv and Node. Uses backend/.env (copied from backend/.env.example the first time).
# Emails (verification, invitations) are printed in this terminal, prefixed [api].
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-8000}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if [ ! -f "$BACKEND/.env" ]; then
  say "Creating backend/.env from .env.example"
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  secret="$(openssl rand -hex 32)"
  sed -i.bak "s#^JANUS_JWT_SECRET=.*#JANUS_JWT_SECRET=$secret#" "$BACKEND/.env" && rm -f "$BACKEND/.env.bak"
fi
if ! grep -q '^JANUS_ENCRYPTION_KEY=.\+' "$BACKEND/.env"; then
  key="$(cd "$BACKEND" && uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
  sed -i.bak "s#^JANUS_ENCRYPTION_KEY=.*#JANUS_ENCRYPTION_KEY=$key#" "$BACKEND/.env" && rm -f "$BACKEND/.env.bak"
fi

# This run's settings, without touching backend/.env: console email, links to this web port.
RUN_ENV="$(mktemp -t janus-env.XXXXXX)"
WORKER_ENV="$(mktemp -t janus-worker-env.XXXXXX)"
# uv cannot read an unquoted value with spaces, such as the example's JANUS_EMAIL_FROM.
grep -v -e '^JANUS_EMAIL_BACKEND=' -e '^JANUS_FRONTEND_URL=' -e '^JANUS_ENVIRONMENT=' "$BACKEND/.env" \
  | sed -E 's#^(JANUS_EMAIL_FROM)=([^"].* .*)$#\1="\2"#' > "$RUN_ENV"
{
  echo "JANUS_EMAIL_BACKEND=console"
  echo "JANUS_FRONTEND_URL=http://localhost:$WEB_PORT"
  echo "JANUS_ENVIRONMENT=development"
} >> "$RUN_ENV"
worker_password="$(grep '^WORKER_DB_PASSWORD=' "$BACKEND/.env" | cut -d= -f2-)"
# The worker signs in as janus_worker and never gets the migration login.
sed "s#^JANUS_DATABASE_URL=postgresql+asyncpg://[^:]*:[^@]*@#JANUS_DATABASE_URL=postgresql+asyncpg://janus_worker:${worker_password:-local-worker-password}@#" "$RUN_ENV" \
  | grep -v '^JANUS_MIGRATION_DATABASE_URL=' > "$WORKER_ENV"

pids=()
cleanup() {
  say "Stopping"
  for pid in ${pids[@]+"${pids[@]}"}; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -f "$RUN_ENV" "$WORKER_ENV"
}
trap cleanup EXIT INT TERM

# The port the API's database URL points at (55433 in the example).
DB_PORT="$(grep '^JANUS_DATABASE_URL=' "$BACKEND/.env" | sed -E 's#.*@[^:/]+:([0-9]+)/.*#\1#')"
DB_PORT="${DB_PORT:-55433}"
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$DB_PORT") 2>/dev/null; }

if port_open; then
  say "Postgres is already running on port $DB_PORT; using it"
else
  say "Postgres"
  (cd "$BACKEND" && docker compose up -d postgres)
  for _ in $(seq 1 30); do port_open && break; sleep 1; done
  port_open || { echo "Postgres did not start on port $DB_PORT." >&2; exit 1; }
  sleep 2  # the port opens a moment before Postgres accepts logins
fi

say "Python packages and migrations"
(cd "$BACKEND" && uv sync --frozen && uv run --env-file "$RUN_ENV" alembic upgrade head)

# npm ci installs exactly what package-lock.json says and never rewrites it.
if [ ! -d "$ROOT/node_modules" ]; then
  say "Web packages"
  (cd "$ROOT" && npm ci --no-audit --no-fund)
fi

prefix() { local tag="$1"; while IFS= read -r line; do printf '[%s] %s\n' "$tag" "$line"; done; }

say "Starting the API on :$API_PORT, the worker, and the web app on :$WEB_PORT"
(cd "$BACKEND" && uv run --env-file "$RUN_ENV" uvicorn janus_api.main:app --port "$API_PORT" --no-access-log 2>&1 | prefix api) &
pids+=($!)
(cd "$BACKEND" && uv run --env-file "$WORKER_ENV" python -m janus_api.worker.main 2>&1 | prefix worker) &
pids+=($!)
(cd "$ROOT" && JANUS_API_URL="http://127.0.0.1:$API_PORT" JANUS_APP_ORIGIN="http://localhost:$WEB_PORT" NEXT_PUBLIC_JANUS_DEMO_MODE=false \
  npx next dev -p "$WEB_PORT" 2>&1 | prefix web) &
pids+=($!)

say "Open http://localhost:$WEB_PORT/signup — verification and invite links appear below as [api] dev_email lines. Ctrl+C stops."
wait
