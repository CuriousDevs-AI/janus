#!/usr/bin/env bash
# Prepares an empty Postgres for the backend test suite, the way docker/init-db.sh prepares the
# local one: the migration login owns the database, and the app and worker log in as roles that are
# neither superusers nor exempt from row-level security, so the tests see the same limits as
# production. Then it runs the migrations.
#
#   PGHOST=localhost PGPORT=5432 PGUSER=janus PGPASSWORD=... PGDATABASE=janus \
#   APP_DB_PASSWORD=... WORKER_DB_PASSWORD=... scripts/ci-backend-db.sh
#
# Used by .github/workflows/ci.yml; safe to run twice.
set -euo pipefail

: "${APP_DB_PASSWORD:?Set APP_DB_PASSWORD}"
: "${WORKER_DB_PASSWORD:?Set WORKER_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 -v app_password="$APP_DB_PASSWORD" -v worker_password="$WORKER_DB_PASSWORD" -v database="$PGDATABASE" <<'SQL'
SELECT format('CREATE ROLE janus_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_password')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'janus_app') \gexec
SELECT format('CREATE ROLE janus_worker LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'worker_password')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'janus_worker') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO janus_app, janus_worker', :'database') \gexec
GRANT USAGE ON SCHEMA public TO janus_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO janus_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO janus_app;
SQL

cd "$(dirname "$0")/../backend"
uv run alembic upgrade head
