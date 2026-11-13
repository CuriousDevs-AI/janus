"""Customers kept and lost, company by company.

Over the last twelve finished months against the twelve before: how many of the customers who
bought before bought again (kept), who is new, and who bought before and not since (lost), largest
first, with the month they last bought, so the owner knows whom to call. From invoices, and from
customer-wise months imported from Tally or Zoho Books for the time before Janus. Customers are
matched by name without case, punctuation, "M/s" or "Pvt Ltd", and by the names an owner said are
the same customer; names that look alike are offered to be merged. Money is read only where the
person's role holds it.
"""

from collections import defaultdict
from datetime import date, timedelta
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.names import party_key as customer_key
from janus_api.core.tenancy import set_context
from janus_api.finance import overview as finance
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company, readable_companies
from janus_api.portfolio.models import CustomerMerge
from janus_api.portfolio.periods import rupees, today_ist

LOST_SHOWN = 8
SIMILAR_SHOWN = 5


def _grouped(
    months: dict[str, dict[date, int]], own: frozenset[str], aliases: dict[str, str]
) -> dict[str, tuple[str, dict[date, int]]]:
    """Sales by matched customer: the name shown (an owner's chosen name, else the spelling with
    the most sales) and sales by month. `aliases` maps a name's key to the customer it is."""
    own_keys = {customer_key(name) for name in own}
    totals: dict[str, dict[str, int]] = defaultdict(dict)
    by_key: dict[str, dict[date, int]] = defaultdict(dict)
    chosen: dict[str, str] = {}
    for name, by_month in months.items():
        key = customer_key(name)
        if key in aliases:
            chosen[customer_key(aliases[key])] = aliases[key]
            key = customer_key(aliases[key])
        if key in own_keys:
            continue
        spelling = name.strip()
        totals[key][spelling] = totals[key].get(spelling, 0) + sum(by_month.values())
        for day, paise in by_month.items():
            by_key[key][day] = by_key[key].get(day, 0) + paise
    return {
        key: (chosen.get(key) or max(totals[key].items(), key=lambda item: item[1])[0], sales)
        for key, sales in by_key.items()
    }


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
    aliases: dict[str, str] | None = None,
) -> tuple[int, int, int, list[schemas.LostCustomer]]:
    """(customers before, kept, new, lost) from sales by customer and month. Sales to the
    person's own companies (`own`, their names) are not customers and are left out."""
    merged = _grouped(months, own, aliases or {})

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


def similar_customers(
    months: dict[str, dict[date, int]],
    own: frozenset[str] = frozenset(),
    aliases: dict[str, str] | None = None,
) -> list[schemas.SimilarCustomers]:
    """Customers whose names look alike ("Gupta Trdrs" and "Gupta Traders"), most sales first,
    for the owner to say whether they are one. Only names sharing their first three letters are
    compared, so a long customer list stays quick."""
    merged = _grouped(months, own, aliases or {})
    total = {key: sum(p for p in sales.values() if p > 0) for key, (_, sales) in merged.items()}
    buckets: dict[str, list[str]] = defaultdict(list)
    for key in merged:
        buckets[key[:3]].append(key)
    pairs: list[tuple[int, str, str]] = []
    for keys in buckets.values():
        for i, first in enumerate(keys):
            for second in keys[i + 1 :]:
                short, long = sorted((first, second), key=len)
                words = len(short) >= 5 and long.startswith(f"{short} ")
                matcher = SequenceMatcher(None, first, second)
                if words or (matcher.quick_ratio() >= 0.85 and matcher.ratio() >= 0.85):
                    keep, fold = sorted((first, second), key=lambda key: -total[key])
                    pairs.append((total[keep] + total[fold], fold, keep))
    pairs.sort(key=lambda pair: -pair[0])
    return [
        schemas.SimilarCustomers(name=merged[fold][0], into=merged[keep][0])
        for _, fold, keep in pairs[:SIMILAR_SHOWN]
    ]


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
            merges = (await db.scalars(select(CustomerMerge).order_by(CustomerMerge.alias))).all()
            aliases = {row.alias_key: row.customer for row in merges}
            earlier, kept, new, lost = retention_for(
                months, (before_start, before_end), (recent_start, recent_end), own, aliases
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
                    similar=similar_customers(months, own, aliases),
                    merges=[
                        schemas.CustomerMergeOut(id=str(row.id), name=row.alias, into=row.customer)
                        for row in merges
                    ],
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


async def merge(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    data: schemas.CustomerMergeIn,
    ip: str | None,
) -> schemas.CustomerMergeOut:
    """Counts one customer name as another from now on, for this company."""
    into = data.into
    alias_key, into_key = customer_key(data.name), customer_key(into)
    if alias_key == into_key:
        raise ApiError("same_customer", "These names are already counted as one customer.", 422)
    try:
        tenant_id = await enter_company(db, user_id, company_id, "billing:manage")
        known = {row.alias_key: row for row in (await db.scalars(select(CustomerMerge))).all()}
        if into_key in known:
            # Merging into a name that is itself merged counts it as that name's customer.
            into_key, into = customer_key(known[into_key].customer), known[into_key].customer
        if alias_key in known or alias_key == into_key:
            raise ApiError(
                "already_merged", f"{data.name} is already counted as another customer.", 409
            )
        row = CustomerMerge(
            tenant_id=tenant_id,
            alias_key=alias_key,
            alias=data.name,
            customer=into,
            merged_by=user_id,
        )
        db.add(row)
        # Names already merged into this one follow it.
        for other in known.values():
            if customer_key(other.customer) == alias_key:
                other.customer = into
        await db.flush()
        record(
            db,
            "portfolio.customers_merged",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"name": data.name, "into": into},
        )
        return schemas.CustomerMergeOut(id=str(row.id), name=row.alias, into=row.customer)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def unmerge(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    merge_id: int,
    ip: str | None,
) -> None:
    """Counts a merged name as its own customer again."""
    try:
        tenant_id = await enter_company(db, user_id, company_id, "billing:manage")
        row = await db.scalar(select(CustomerMerge).where(CustomerMerge.id == merge_id))
        if row is None:
            raise ApiError("merge_not_found", "That merge was not found.", 404)
        await db.delete(row)
        await db.flush()
        record(
            db,
            "portfolio.customers_unmerged",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"name": row.alias, "into": row.customer},
        )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
