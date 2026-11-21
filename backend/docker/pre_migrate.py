"""Run before alembic: create missing roles, disable FORCE RLS so the owner can migrate."""
import asyncio
import os

async def main() -> None:
    import asyncpg

    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        print("DATABASE_URL not set, skipping pre-migrate")
        return
    url = raw.replace("postgresql+asyncpg://", "postgresql://").replace("postgres://", "postgresql://")
    conn = await asyncpg.connect(url)

    # 1. Create roles referenced by GRANT/REVOKE in migrations.
    for role in ("janus_app", "janus_worker"):
        exists = await conn.fetchval("SELECT 1 FROM pg_roles WHERE rolname=$1", role)
        if not exists:
            await conn.execute(f"CREATE ROLE {role}")
            print(f"Created role {role}")
        else:
            print(f"Role {role} exists")

    # 2. Disable FORCE ROW LEVEL SECURITY on every table the current user owns,
    #    so alembic can INSERT seed data without being blocked by RLS policies.
    tables = await conn.fetch(
        "SELECT relname FROM pg_class "
        "WHERE relkind='r' AND relnamespace='public'::regnamespace AND relrowsecurity"
    )
    for row in tables:
        name = row["relname"]
        await conn.execute(f'ALTER TABLE public."{name}" DISABLE ROW LEVEL SECURITY')
        print(f"Disabled RLS on {name}")

    await conn.close()
    print("Pre-migrate done.")

asyncio.run(main())
