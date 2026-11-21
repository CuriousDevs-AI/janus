"""Run after alembic: re-enable RLS + FORCE on tables that had it."""
import asyncio
import os

async def main() -> None:
    import asyncpg

    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        return
    url = raw.replace("postgresql+asyncpg://", "postgresql://").replace("postgres://", "postgresql://")
    conn = await asyncpg.connect(url)

    # Find tables that have RLS policies — they should have RLS enabled and forced.
    tables = await conn.fetch(
        "SELECT DISTINCT tablename FROM pg_policies WHERE schemaname='public'"
    )
    for row in tables:
        name = row["tablename"]
        await conn.execute(f'ALTER TABLE public."{name}" ENABLE ROW LEVEL SECURITY')
        await conn.execute(f'ALTER TABLE public."{name}" FORCE ROW LEVEL SECURITY')

    count = len(tables)
    if count:
        print(f"Re-enabled RLS on {count} tables.")
    else:
        print("No RLS policies found, nothing to re-enable.")

    await conn.close()

asyncio.run(main())
