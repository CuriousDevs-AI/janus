"""What other modules may ask Finance to do, with the same checks as Finance's own screens."""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit import service as audit
from janus_api.core.errors import ApiError
from janus_api.finance.models import FinanceBill
from janus_api.rules.service import ensure_open


async def record_bill(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    user_name: str,
    *,
    vendor: str,
    vendor_bill_no: str,
    bill_date: date,
    due_date: date,
    amount_paise: int,
    gst_paise: int,
    idempotency_key: str,
    ip: str | None,
) -> str:
    """Records a supplier bill in this company (the caller is in its context and has checked the
    person may record bills) and returns its number. Asking twice with one key records it once."""
    existing = await db.scalar(
        select(FinanceBill.number).where(
            FinanceBill.tenant_id == tenant_id, FinanceBill.idempotency_key == idempotency_key
        )
    )
    if existing is not None:
        return str(existing)
    if amount_paise <= 0 or not 0 <= gst_paise < amount_paise:
        raise ApiError("invalid_bill", "The bill's amount or GST is not valid.", 422)
    if due_date < bill_date:
        due_date = bill_date
    await ensure_open(db, tenant_id, bill_date)
    count = await db.scalar(
        select(func.count()).select_from(FinanceBill).where(FinanceBill.tenant_id == tenant_id)
    )
    row = FinanceBill(
        tenant_id=tenant_id,
        number=f"BILL-{bill_date.year}-{101 + (count or 0):04d}",
        vendor=vendor.strip()[:160],
        vendor_bill_no=vendor_bill_no.strip()[:80],
        bill_date=bill_date,
        due_date=due_date,
        amount_paise=amount_paise,
        gst_paise=gst_paise,
        created_by=user_id,
        created_by_name=user_name,
        idempotency_key=idempotency_key[:80],
    )
    db.add(row)
    await db.flush()
    audit.record(
        db,
        "finance.bill_recorded",
        user_id=user_id,
        tenant_id=tenant_id,
        ip=ip,
        details={"bill": row.number, "amount_paise": amount_paise, "vendor": row.vendor},
    )
    return row.number
