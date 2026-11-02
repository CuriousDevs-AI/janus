"""What the vault tells other modules about one company. Other modules read the vault through these
functions, never its tables. Each runs under the company's own context, so row-level security
applies."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.vault.models import VendorBankAccount


async def pending_bank_details(db: AsyncSession, tenant_id: int) -> int:
    """Supplier bank details waiting to be approved."""
    count = await db.scalar(
        select(func.count(VendorBankAccount.id)).where(
            VendorBankAccount.tenant_id == tenant_id, VendorBankAccount.status == "pending"
        )
    )
    return int(count or 0)
