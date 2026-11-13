"""Importing a company's bank statement from the Portfolio, so cash in the bank and how long it
lasts can be shown. The page reads the bank's CSV in the browser and sends its lines; Finance keeps
them, skipping any already imported."""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.tenancy import set_context
from janus_api.finance import service as finance_service
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company


def _paise(value: str) -> int:
    return int((Decimal(value) * 100).to_integral_value())


async def import_statement(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    data: schemas.BankStatementIn,
    ip: str | None,
) -> schemas.BankImported:
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        added, skipped = await finance_service.import_bank_lines(
            db,
            tenant_id,
            user_id,
            data.account,
            [
                finance_service.BankRow(
                    day=row.date,
                    description=row.description,
                    amount_paise=_paise(row.amount),
                    balance_paise=_paise(row.balance) if row.balance is not None else None,
                )
                for row in data.rows
            ],
            ip,
        )
        return schemas.BankImported(added=added, skipped=skipped)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
