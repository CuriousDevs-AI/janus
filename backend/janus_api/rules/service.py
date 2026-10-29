"""The company's rules as the server applies them. Money and stock writes check the period lock."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select

from janus_api.core.deps import Db
from janus_api.core.errors import ApiError
from janus_api.rules.models import CompanyRules

DEFAULT_APPROVAL_PAISE = 1_000_000  # ₹10,000
DEFAULT_TOLERANCE = Decimal(2)  # percent


@dataclass(frozen=True)
class Rules:
    locked_through: date | None
    adjustment_approval_paise: int
    match_tolerance_percent: Decimal


async def rules_for(db: Db, tenant_id: int) -> Rules:
    row = await db.scalar(select(CompanyRules).where(CompanyRules.tenant_id == tenant_id))
    if row is None:
        return Rules(None, DEFAULT_APPROVAL_PAISE, DEFAULT_TOLERANCE)
    return Rules(
        row.locked_through,
        row.adjustment_approval_value_paise,
        Decimal(row.match_tolerance_percent),
    )


async def ensure_open(db: Db, tenant_id: int, day: date) -> None:
    """Refuses an entry dated on or before the locked-through date. The owner reopens the period."""
    locked = (await rules_for(db, tenant_id)).locked_through
    if locked is not None and day <= locked:
        raise ApiError(
            "period_locked",
            f"The period through {locked.isoformat()} is locked. Ask the owner to reopen it.",
            422,
        )
