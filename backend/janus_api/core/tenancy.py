from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def set_context(
    db: AsyncSession, *, tenant_id: int | None = None, user_id: int | None = None
) -> None:
    # Persist pending rows under their original tenant before switching contexts.
    await db.flush()
    # set_config(..., true) is the parameterized equivalent of SET LOCAL.
    await db.execute(
        text(
            "SELECT set_config('app.tenant_id', :tenant, true), "
            "set_config('app.user_id', :actor, true)"
        ),
        {"tenant": str(tenant_id or ""), "actor": str(user_id or "")},
    )
