"""Reading and changing the account's plan, paying for it through Razorpay, and its invoices.

The plan, payments and invoices are the person's own rows (row-level security on app.user_id).
A paid plan is bought through Razorpay: the server makes the order, Razorpay Checkout takes the
payment in the browser, and the plan changes only once Razorpay's signature checks out, from the
browser's confirmation or from Razorpay's webhook, whichever comes first. Outside production a plan
can also change at once with nothing charged (test mode), and sample invoices can be made.
"""

import hashlib
import hmac
import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.billing import change, schemas
from janus_api.billing.models import AccountInvoice, AccountPayment, AccountPlan, AccountRefund
from janus_api.billing.plans import BY_ID, GST_RATE, PLANS, Plan
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org
from janus_api.org import service as org_service


def _today() -> date:
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def _rupees(paise: int) -> str:
    return str((Decimal(paise) / 100).quantize(Decimal("0.01")))


def _add_month(day: date) -> date:
    """The same day next month, or that month's last day where it is shorter."""
    year, month = (day.year + 1, 1) if day.month == 12 else (day.year, day.month + 1)
    following = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return min(date(year, month, 1) + timedelta(days=day.day - 1), following - timedelta(days=1))


def _plan_out(plan: Plan) -> schemas.PlanOut:
    return schemas.PlanOut(
        id=plan.id,
        name=plan.name,
        tagline=plan.tagline,
        price=None if plan.price_paise is None else _rupees(plan.price_paise),
        companies=plan.companies,
        logins=plan.logins,
        features=list(plan.features),
    )


def _changes_allowed() -> bool:
    return get_settings().environment != "production"


RAZORPAY = "https://api.razorpay.com/v1"


def _razorpay() -> tuple[str, str] | None:
    """The key id and secret, or None while Razorpay is not set up."""
    settings = get_settings()
    secret = settings.razorpay_key_secret.get_secret_value()
    return (settings.razorpay_key_id, secret) if settings.razorpay_key_id and secret else None


def _payments() -> Literal["razorpay", "test", "off"]:
    return "razorpay" if _razorpay() else "test" if _changes_allowed() else "off"


def _signed(message: bytes, secret: str, signature: str) -> bool:
    expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _create_order(amount: int, receipt: str, notes: dict[str, str]) -> str:
    """Makes a Razorpay order for the amount, in paise, and returns its id."""
    keys = _razorpay()
    assert keys is not None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{RAZORPAY}/orders",
                auth=keys,
                json={"amount": amount, "currency": "INR", "receipt": receipt, "notes": notes},
            )
    except httpx.HTTPError as error:
        raise ApiError(
            "payment_unavailable", "Razorpay could not be reached. Try again.", 502
        ) from error
    if response.status_code >= 300:
        raise ApiError("payment_unavailable", "Razorpay refused the order. Try again later.", 502)
    order_id: str = response.json()["id"]
    return order_id


async def check_room(db: AsyncSession, tenant_id: int, *, company: bool = False) -> None:
    """Refuses one more company (`company`) or one more seat (a member or an invitation) past the
    plan of the account the company belongs to. The caller is inside that company's context."""
    if not get_settings().plan_limits:
        return
    usage = (
        await db.execute(text("SELECT * FROM plan_usage(:tenant)"), {"tenant": tenant_id})
    ).first()
    if usage is None:
        return
    plan = BY_ID.get(usage.plan, BY_ID["free"])
    used, allowed, word = (
        (usage.companies, plan.companies, "companies")
        if company
        else (usage.seats, plan.logins, "people")
    )
    if allowed is not None and used >= allowed:

        def room(item: Plan) -> int | None:
            return item.companies if company else item.logins

        better = next(
            (
                item
                for item in PLANS[PLANS.index(plan) + 1 :]
                if (size := room(item)) is None or size > used
            ),
            None,
        )
        raise ApiError(
            "plan_limit",
            f"The {plan.name} plan includes {allowed} {word}, and all are in use."
            + (f" Upgrade to {better.name} in Portfolio, Plan and billing." if better else "")
            + " An Owner chooses the plan.",
            409,
        )


async def _usage(
    db: AsyncSession, user_id: int, current_tenant: int | None, owned: list[int]
) -> schemas.Usage:
    rows: list[schemas.CompanyUsage] = []
    try:
        for tenant_id in owned:
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            company = await org.company(db, tenant_id)
            members, invites = await org_service.seat_holders(db, tenant_id)
            rows.append(
                schemas.CompanyUsage(
                    id=str(tenant_id),
                    name=company.name if company else str(tenant_id),
                    people=sum(1 for _, _, status, _ in members if status == "active"),
                    invited=len(invites),
                )
            )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return schemas.Usage(
        companies=len(owned),
        logins=sum(row.people + row.invited for row in rows),
        byCompany=rows,
    )


async def _owns(db: AsyncSession, user_id: int) -> bool:
    return bool(await org.owned_tenants(db, user_id))


async def _row(db: AsyncSession, user_id: int) -> AccountPlan | None:
    row: AccountPlan | None = await db.scalar(
        select(AccountPlan).where(AccountPlan.user_id == user_id)
    )
    return row


async def view(db: AsyncSession, user_id: int, current_tenant: int | None) -> schemas.BillingOut:
    owned = await org.owned_tenants(db, user_id)
    row = await _row(db, user_id)
    invoices = (
        await db.scalars(
            select(AccountInvoice)
            .where(AccountInvoice.user_id == user_id)
            .order_by(AccountInvoice.period_start.desc())
        )
    ).all()
    return schemas.BillingOut(
        owner=bool(owned),
        plan=row.plan if row else "free",
        startedOn=row.started_on.isoformat() if row else None,
        renewsOn=row.renews_on.isoformat() if row and row.renews_on else None,
        usage=await _usage(db, user_id, current_tenant, owned),
        gstRate=GST_RATE,
        plans=[_plan_out(plan) for plan in PLANS],
        invoices=[
            schemas.InvoiceOut(
                number=item.number,
                plan=BY_ID[item.plan].name if item.plan in BY_ID else item.plan,
                issuedOn=item.issued_on.isoformat(),
                periodStart=item.period_start.isoformat(),
                periodEnd=item.period_end.isoformat(),
                amount=_rupees(item.amount_paise),
                gst=_rupees(item.gst_paise),
                total=_rupees(item.total_paise),
                status=item.status,
                paidOn=item.paid_on.isoformat() if item.paid_on else None,
                sample=item.sample,
            )
            for item in invoices
        ],
        canChange=bool(owned) and _changes_allowed(),
        payments=_payments(),
        chosen=row is not None,
        refunds=[
            schemas.RefundOut(
                invoice=item.invoice,
                plan=BY_ID[item.plan].name if item.plan in BY_ID else item.plan,
                daysUnused=item.days_unused,
                daysTotal=item.days_total,
                amount=_rupees(item.amount_paise),
                status=item.status,
                createdOn=item.created_at.astimezone(ZoneInfo("Asia/Kolkata")).date().isoformat(),
            )
            for item in (
                await db.scalars(
                    select(AccountRefund)
                    .where(AccountRefund.user_id == user_id)
                    .order_by(AccountRefund.id.desc())
                )
            ).all()
        ],
        archived=[
            schemas.Company(id=str(cid), name=name)
            for cid, name, status in (
                await _owner_companies(db, user_id, current_tenant) if owned else []
            )
            if status == "archived"
        ],
    )


async def _owner_companies(
    db: AsyncSession, user_id: int, current_tenant: int | None
) -> list[tuple[int, str, str]]:
    try:
        return await org_service.owner_companies(db, user_id)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def change_plan(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    plan_id: str,
    keep: list[str],
    ip: str,
) -> schemas.BillingOut:
    """Moves the account to another plan from today. Enterprise is set up with the Janus team."""
    if not await org.owned_tenants(db, user_id):
        raise ApiError("forbidden", "The plan belongs to the Owner of the companies.", 403)
    if plan_id == "enterprise":
        raise ApiError(
            "contact_sales", "Enterprise is set up with the Janus team, on agreed terms.", 409
        )
    # Free costs nothing, so moving to it never waits on a payment.
    if plan_id != "free" and not _changes_allowed():
        raise ApiError(
            "payments_not_connected",
            "A paid plan is bought through checkout, which is not connected yet.",
            409,
        )
    await change.apply(db, user_id, current_tenant, plan_id, keep, ip)
    plan = BY_ID[plan_id]
    if plan.price_paise:
        # Test mode: the month is recorded as a paid sample invoice, so a later move refunds it
        # the way a paid one would be.
        today = _today()
        taken = await db.scalar(
            select(func.count(AccountInvoice.id)).where(AccountInvoice.user_id == user_id)
        )
        gst = plan.price_paise * GST_RATE // 100
        db.add(
            AccountInvoice(
                user_id=user_id,
                number=f"JNS-{today.year}-{int(taken or 0) + 1:04d}",
                plan=plan.id,
                issued_on=today,
                period_start=today,
                period_end=_add_month(today) - timedelta(days=1),
                amount_paise=plan.price_paise,
                gst_paise=gst,
                total_paise=plan.price_paise + gst,
                status="paid",
                paid_on=today,
                sample=True,
            )
        )
        await db.flush()
    return await view(db, user_id, current_tenant)


async def _set_plan(db: AsyncSession, user_id: int, plan_id: str, ip: str | None) -> date | None:
    """Puts the account on the plan from today; returns the day it renews, None for Free."""
    row = await _row(db, user_id)
    before = row.plan if row else "free"
    today = _today()
    if row is None:
        row = AccountPlan(user_id=user_id, plan=plan_id, started_on=today)
        db.add(row)
    row.plan, row.started_on, row.updated_at = plan_id, today, now()
    row.renews_on = None if plan_id == "free" else _add_month(today)
    record(
        db,
        "billing.plan_changed",
        user_id=user_id,
        ip=ip,
        details={"from": before, "to": plan_id},
    )
    return row.renews_on


async def checkout(
    db: AsyncSession,
    user_id: int,
    name: str,
    email: str,
    plan_id: str,
    keep: list[str],
    ip: str,
) -> schemas.CheckoutOut:
    """A Razorpay order for one month of the plan, GST included, for Checkout to take payment."""
    keys = _razorpay()
    if keys is None:
        raise ApiError("payments_not_connected", "Razorpay is not set up on this server.", 409)
    if not await org.owned_tenants(db, user_id):
        raise ApiError("forbidden", "The plan belongs to the Owner of the companies.", 403)
    plan = BY_ID[plan_id]
    assert plan.price_paise
    amount = plan.price_paise + plan.price_paise * GST_RATE // 100
    count = await db.scalar(
        select(func.count(AccountPayment.id)).where(AccountPayment.user_id == user_id)
    )
    order_id = await _create_order(
        amount, f"janus-{user_id}-{int(count or 0) + 1}", {"plan": plan.id, "account": str(user_id)}
    )
    db.add(
        AccountPayment(
            user_id=user_id, plan=plan.id, order_id=order_id, amount_paise=amount, keep=keep
        )
    )
    record(db, "billing.checkout", user_id=user_id, ip=ip, details={"plan": plan.id})
    return schemas.CheckoutOut(
        keyId=keys[0],
        orderId=order_id,
        amount=amount,
        currency="INR",
        plan=plan.name,
        description=f"Janus {plan.name} plan, one month",
        name=name,
        email=email,
    )


async def _settle(
    db: AsyncSession,
    payment: AccountPayment,
    payment_id: str,
    current_tenant: int | None,
    ip: str | None,
) -> None:
    """Records a confirmed payment once: the plan from today, and a paid invoice for the month."""
    if payment.status == "paid":
        return
    payment.status, payment.payment_id, payment.paid_at = "paid", payment_id, now()
    # The month left on the old plan is refunded, and what the new plan cannot hold archived, as
    # the buyer saw before paying.
    await change.apply(db, payment.user_id, current_tenant, payment.plan, payment.keep, ip)
    row = await _row(db, payment.user_id)
    renews = row.renews_on if row else None
    today = _today()
    taken = await db.scalar(
        select(func.count(AccountInvoice.id)).where(AccountInvoice.user_id == payment.user_id)
    )
    amount = BY_ID[payment.plan].price_paise or 0
    db.add(
        AccountInvoice(
            user_id=payment.user_id,
            number=f"JNS-{today.year}-{int(taken or 0) + 1:04d}",
            plan=payment.plan,
            issued_on=today,
            period_start=today,
            period_end=(renews or _add_month(today)) - timedelta(days=1),
            amount_paise=amount,
            gst_paise=payment.amount_paise - amount,
            total_paise=payment.amount_paise,
            status="paid",
            paid_on=today,
            sample=False,
            payment_id=payment_id,
        )
    )
    record(
        db,
        "billing.paid",
        user_id=payment.user_id,
        ip=ip,
        details={"plan": payment.plan, "payment": payment_id},
    )
    await db.flush()


async def verify(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    data: schemas.CheckoutVerify,
    ip: str,
) -> schemas.BillingOut:
    """Checks Razorpay's signature on the payment the browser reports, then records it."""
    keys = _razorpay()
    if keys is None:
        raise ApiError("payments_not_connected", "Razorpay is not set up on this server.", 409)
    payment = await db.scalar(select(AccountPayment).where(AccountPayment.order_id == data.orderId))
    if payment is None:
        raise ApiError("not_found", "That payment is not one of yours.", 404)
    if not _signed(f"{data.orderId}|{data.paymentId}".encode(), keys[1], data.signature):
        raise ApiError("bad_signature", "The payment could not be confirmed with Razorpay.", 400)
    await _settle(db, payment, data.paymentId, current_tenant, ip)
    return await view(db, user_id, current_tenant)


async def webhook(db: AsyncSession, body: bytes, signature: str, ip: str) -> None:
    """Razorpay's notice of a captured payment, in case the browser closed before confirming it.
    Signed with the webhook secret; settled under the account's own context."""
    secret = get_settings().razorpay_webhook_secret.get_secret_value()
    if not secret:
        raise ApiError("not_found", "Not found.", 404)
    if not _signed(body, secret, signature):
        raise ApiError("bad_signature", "Signature does not match.", 400)
    event = json.loads(body)
    if event.get("event") not in ("payment.captured", "order.paid"):
        return
    entity = event["payload"]["payment"]["entity"]
    order_id, payment_id = entity.get("order_id"), entity.get("id")
    owner = await db.scalar(text("SELECT account_payment_owner(:order)"), {"order": order_id})
    if owner is None:
        return
    await set_context(db, user_id=int(owner))
    payment = await db.scalar(select(AccountPayment).where(AccountPayment.order_id == order_id))
    if payment is not None and int(entity.get("amount", 0)) == payment.amount_paise:
        await _settle(db, payment, str(payment_id), None, ip)


async def add_sample_invoices(
    db: AsyncSession, user_id: int, current_tenant: int | None, months: int, ip: str
) -> schemas.BillingOut:
    """Monthly invoices for the current paid plan over the months before, marked as samples, for
    testing the billing page. Refused in production. A month already invoiced is left alone."""
    if not _changes_allowed():
        raise ApiError("not_found", "Not found.", 404)
    row = await _row(db, user_id)
    plan = BY_ID.get(row.plan) if row else None
    if plan is None or not plan.price_paise:
        raise ApiError("no_paid_plan", "Sample invoices need a paid plan first.", 409)
    taken = set(
        (
            await db.scalars(
                select(AccountInvoice.period_start).where(AccountInvoice.user_id == user_id)
            )
        ).all()
    )
    count = len(taken)
    today = _today()
    start = today.replace(day=1)
    for back in range(months - 1, -1, -1):
        index = start.year * 12 + start.month - 1 - back
        period_start = date(index // 12, index % 12 + 1, 1)
        if period_start in taken:
            continue
        period_end = _add_month(period_start) - timedelta(days=1)
        count += 1
        amount = plan.price_paise
        gst = amount * GST_RATE // 100
        newest = back == 0
        db.add(
            AccountInvoice(
                user_id=user_id,
                number=f"JNS-{period_start.year}-{count:04d}",
                plan=plan.id,
                issued_on=period_start,
                period_start=period_start,
                period_end=period_end,
                amount_paise=amount,
                gst_paise=gst,
                total_paise=amount + gst,
                status="due" if newest else "paid",
                paid_on=None if newest else period_start + timedelta(days=2),
                sample=True,
            )
        )
    record(db, "billing.sample_invoices", user_id=user_id, ip=ip, details={"months": months})
    await db.flush()
    return await view(db, user_id, current_tenant)
