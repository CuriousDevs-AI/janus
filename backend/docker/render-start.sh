#!/bin/sh
set -e

# Render gives DATABASE_URL as postgres://… — convert it for asyncpg.
if [ -n "$DATABASE_URL" ] && [ -z "$JANUS_DATABASE_URL" ]; then
  export JANUS_DATABASE_URL=$(echo "$DATABASE_URL" | sed 's|^postgres://|postgresql+asyncpg://|;s|^postgresql://|postgresql+asyncpg://|')
  export JANUS_MIGRATION_DATABASE_URL="$JANUS_DATABASE_URL"
fi

echo "JANUS_DATABASE_URL is ${JANUS_DATABASE_URL:+set}"
echo "JANUS_MIGRATION_DATABASE_URL is ${JANUS_MIGRATION_DATABASE_URL:+set}"

# Run migrations before starting (only the API service, not the worker).
if echo "$@" | grep -q "uvicorn"; then
  /app/.venv/bin/python /app/docker/pre_migrate.py
  echo "Running database migrations..."
  cd /app && /app/.venv/bin/alembic -c /app/alembic.ini upgrade head
  echo "Migrations complete."
  /app/.venv/bin/python /app/docker/post_migrate.py
fi

exec "$@"
