"""Customers kept and lost, company by company.

Over the last twelve finished months against the twelve before: how many of the customers who
bought before bought again (kept), who is new, and who bought before and not since (lost), largest
first, with the month they last bought, so the owner knows whom to call. From invoices, and from
customer-wise months imported from Tally or Zoho Books for the time before Janus. Customers are
matched by name, ignoring case and spaces at the ends. Money is read only where the person's role
holds it.
"""

from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.tenancy import set_context
from janus_api.finance import overview as finance
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import schemas
from janus_api.portfolio.access import readable_companies
from janus_api.portfolio.periods import rupees, today_ist

LOST_SHOWN = 8


def spans(today: date) -> tuple[date, date, date, date]:
    """The twelve finished months to the end of last month, and the twelve before them."""
    recent_end = today.replace(day=1) - timedelta(days=1)
    recent_start = date(recent_end.year - 1, recent_end.month, 1) + timedelta(days=32)
    recent_start = recent_start.replace(day=1)
    before_start = date(recent_start.year - 1, recent_start.month, 1)
    return before_start, recent_start - timedelta(days=1), recent_start, recent_end


def retention_for(
    months: dict[str, dict[date, int]],
    before: tuple[date, date],
    recent: tuple[date, date],
    own: frozenset[str] = frozenset(),
) -> tuple[int, int, int, list[schemas.LostCustomer]]:
    """(customers before, kept, new, lost) from sales by customer and month. Sales to the
    person's own companies (`own`, casefolded names) are not customers and are left out."""
    merged: dict[str, tuple[str, dict[date, int]]] = {}
    for name, by_month in months.items():
        key = name.strip().casefold()
        if key in own:
            continue
        shown, kept = merged.get(key, (name.strip(), {}))
        for day, paise in by_month.items():
            kept[day] = kept.get(day, 0) + paise
        merged[key] = (shown, kept)

    def bought(by_month: dict[date, int], span: tuple[date, date]) -> int:
        return sum(p for day, p in by_month.items() if span[0] <= day <= span[1] and p > 0)

    earlier = {key for key, (_, m) in merged.items() if bought(m, before) > 0}
    lately = {key for key, (_, m) in merged.items() if bought(m, recent) > 0}
    lost = sorted(
        (
            schemas.LostCustomer(
                name=merged[key][0],
                salesBefore=rupees(bought(merged[key][1], before), paise=True),
                lastBought=f"{max(d for d, p in merged[key][1].items() if p > 0):%Y-%m}",
            )
            for key in earlier - lately
        ),
        key=lambda item: -float(item.salesBefore),
    )
    return len(earlier), len(earlier & lately), len(lately - earlier), lost


async def retention(
    db: AsyncSession, user_id: int, current_tenant: int | None
) -> schemas.CustomerRetentionList:
    before_start, before_end, recent_start, recent_end = spans(today_ist())
    out: list[schemas.CustomerRetention] = []
    try:
        mine = await readable_companies(db, user_id)
        names = set()
        for tenant_id in mine:
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            found = await org.company(db, tenant_id)
            if found:
                names.add(found.name.strip().casefold())
        own = frozenset(names)
        for tenant_id in mine:
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            _, role = await org_service.membership(db, user_id, tenant_id)
            company = await org.company(db, tenant_id)
            if company is None or "portfolio:finance" not in role.permissions:
                continue
            months, imported = await finance.customer_months(
                db, tenant_id, before_start, recent_end
            )
            earlier, kept, new, lost = retention_for(
                months, (before_start, before_end), (recent_start, recent_end), own
            )
            out.append(
                schemas.CustomerRetention(
                    companyId=str(tenant_id),
                    company=company.name,
                    before=earlier,
                    kept=kept,
                    new=new,
                    rate=round(kept / earlier * 100) if earlier else None,
                    lostCount=len(lost),
                    lost=lost[:LOST_SHOWN],
                    imported=imported,
                )
            )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.CustomerRetentionList(
        beforeStart=before_start.isoformat(),
        beforeEnd=before_end.isoformat(),
        recentStart=recent_start.isoformat(),
        recentEnd=recent_end.isoformat(),
        companies=out,
    )
