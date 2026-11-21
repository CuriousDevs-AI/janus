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
  # Migrations GRANT/REVOKE on janus_app and janus_worker roles.
  # Render's free Postgres only has the owner role — create them if missing.
  echo "Ensuring janus_app and janus_worker roles exist..."
  /app/.venv/bin/python -c "
import asyncio, os
async def ensure_roles():
    import asyncpg
    url = os.environ.get('DATABASE_URL', '').replace('postgresql+asyncpg://', 'postgresql://')
    if not url:
        return
    conn = await asyncpg.connect(url)
    for role in ('janus_app', 'janus_worker'):
        exists = await conn.fetchval(\"SELECT 1 FROM pg_roles WHERE rolname=\$1\", role)
        if not exists:
            await conn.execute(f'CREATE ROLE {role}')
            print(f'Created role {role}')
        else:
            print(f'Role {role} exists')
    await conn.close()
asyncio.run(ensure_roles())
"

  echo "Running database migrations..."
  cd /app && /app/.venv/bin/alembic -c /app/alembic.ini upgrade head
  echo "Migrations complete."
fi

exec "$@"
