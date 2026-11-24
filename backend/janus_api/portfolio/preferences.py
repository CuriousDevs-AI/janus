"""Each person's Portfolio settings, kept on the server: notifications read, Work inbox snoozes,
and the thresholds at which a company turns red for them."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.portfolio import schemas
from janus_api.portfolio.models import PortfolioPreference


async def read(db: AsyncSession, user_id: int) -> schemas.Preferences:
    """The caller is in this person's context."""
    row = await db.scalar(select(PortfolioPreference).where(PortfolioPreference.user_id == user_id))
    if row is None:
        return schemas.Preferences()
    return schemas.Preferences(
        read=row.read[-1000:], snoozed=row.snoozed, thresholds=schemas.Thresholds(**row.thresholds)
    )


async def save(
    db: AsyncSession, user_id: int, data: schemas.Preferences, ip: str | None = None
) -> schemas.Preferences:
    row = await db.scalar(select(PortfolioPreference).where(PortfolioPreference.user_id == user_id))
    old_thresholds = row.thresholds if row else None
    if row is None:
        row = PortfolioPreference(user_id=user_id)
        db.add(row)
    row.read = data.read[-1000:]
    row.snoozed = dict(list(data.snoozed.items())[-500:])
    row.thresholds = data.thresholds.model_dump()
    await db.flush()
    if old_thresholds != row.thresholds:
        record(
            db,
            "portfolio.preferences_saved",
            user_id=user_id,
            ip=ip,
            details={"thresholds": row.thresholds},
        )
    return await read(db, user_id)
