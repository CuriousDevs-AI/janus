#!/bin/sh
# Render gives DATABASE_URL as postgres://… — convert it for asyncpg.
if [ -n "$DATABASE_URL" ] && [ -z "$JANUS_DATABASE_URL" ]; then
  export JANUS_DATABASE_URL=$(echo "$DATABASE_URL" | sed 's|^postgres://|postgresql+asyncpg://|;s|^postgresql://|postgresql+asyncpg://|')
  export JANUS_MIGRATION_DATABASE_URL="$JANUS_DATABASE_URL"
fi

# Run migrations before starting (only the API service, not the worker).
if echo "$@" | grep -q "uvicorn"; then
  echo "Running database migrations..."
  /app/.venv/bin/alembic upgrade head
fi

exec "$@"
