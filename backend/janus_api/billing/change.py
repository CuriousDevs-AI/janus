"""Moving the account to another plan: what fits is kept, what does not is archived, what was
archived comes back when there is room, and the unused days of a paid month are refunded.

The same reckoning shows the person what will happen (`preview`) and then does it (`apply`), so the
popup and the result never differ. Companies first: the one the session is in is always kept, then
those the person chose, then the oldest. People next, across the companies kept: open invitations
are withdrawn newest first, then members (never an Owner) archived newest first. Coming back works
the other way round, oldest first. Nothing is deleted.
"""

from dataclasses import dataclass, field
from datetime import date

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth.service import user_directory
from janus_api.billing import schemas
from janus_api.billing import service as billing
from janus_api.billing.models import AccountInvoice, AccountRefund
from janus_api.billing.plans import BY_ID, GST_RATE, Plan
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.org import service as org


@dataclass
class _Seat:
    tenant: int
    company: str
    member: int
    user: int
    owner: bool


@dataclass
class _Invite:
    tenant: int
    company: str
    invite: int
    email: str


@dataclass
class _Plan:
    """Everything a move does, worked out before any of it is done."""

    preview: schemas.ChangePreview
    archive_companies: list[int] = field(default_factory=list)
    restore_companies: list[tuple[int, int]] = field(default_factory=list)
    withdraw: list[_Invite] = field(default_factory=list)
    archive_people: list[_Seat] = field(default_factory=list)
    restore_people: list[_Seat] = field(default_factory=list)
    refund: tuple[AccountInvoice, int, int, int] | None = None


def _refund_for(invoice: AccountInvoice, today: date) -> tuple[int, int, int]:
    """Days used (today counts), days in the month paid for, and the paise for the days left."""
    total = (invoice.period_end - invoice.period_start).days + 1
    used = min(total, max(1, (today - invoice.period_start).days + 1))
    return used, total, invoice.total_paise * (total - used) // total


async def _reckon(
    db: AsyncSession, user_id: int, current_tenant: int | None, target: Plan, keep: list[str]
) -> _Plan:
    try:
        companies = await org.owner_companies(db, user_id)
        active = [(cid, name) for cid, name, status in companies if status == "active"]
        archived = [(cid, name) for cid, name, status in companies if status == "archived"]
        names = dict((cid, name) for cid, name, _ in companies)
        wanted = [int(item) for item in keep if item.isdigit()]
        if any(cid not in {c for c, _ in active} for cid in wanted):
            raise ApiError("not_found", "Keep only companies you own.", 404)
        limit = target.companies
        if limit is not None and len(active) > limit:
            order = [current_tenant] if current_tenant in names else []
            order += wanted + [cid for cid, _ in active]
            kept: list[int] = []
            for cid in order:
                if cid is not None and cid not in kept and names.get(cid) and cid in dict(active):
                    kept.append(cid)
            if (
                len({*wanted, *([current_tenant] if current_tenant in dict(active) else [])})
                > limit
            ):
                raise ApiError(
                    "too_many_kept",
                    f"The {target.name} plan holds {limit} "
                    f"{'company' if limit == 1 else 'companies'}; keep no more than that.",
                    422,
                )
            kept = kept[:limit]
            to_archive = [cid for cid, _ in active if cid not in kept]
            back: list[int] = []
        else:
            kept = [cid for cid, _ in active]
            to_archive = []
            room = None if limit is None else limit - len(active)
            back = [cid for cid, _ in archived][:room]

        seats: list[_Seat] = []
        dormant: list[_Seat] = []
        invites: list[_Invite] = []
        owners_back: list[tuple[int, int]] = []
        for cid in kept + back:
            await set_context(db, user_id=user_id, tenant_id=cid)
            members, open_invites = await org.seat_holders(db, cid)
            for member_id, member_user, status, is_owner in members:
                seat = _Seat(cid, names[cid], member_id, member_user, is_owner)
                if cid in back and member_user == user_id:
                    owners_back.append((cid, member_id))
                    seats.append(seat)
                elif status == "active":
                    seats.append(seat)
                elif not is_owner:
                    dormant.append(seat)
            invites += [_Invite(cid, names[cid], iid, email) for iid, email in open_invites]

        plan = _Plan(
            preview=schemas.ChangePreview(
                plan=target.id,
                companyLimit=limit,
                peopleLimit=target.logins,
                companies=[
                    schemas.KeepOption(
                        id=str(cid), name=name, current=cid == current_tenant, keep=cid in kept
                    )
                    for cid, name in active
                ],
                archiveCompanies=[
                    schemas.Company(id=str(cid), name=names[cid]) for cid in to_archive
                ],
                archivePeople=[],
                withdrawInvitations=[],
                restoreCompanies=[schemas.Company(id=str(cid), name=names[cid]) for cid in back],
                restorePeople=[],
                refund=None,
                charge=None
                if not target.price_paise
                else billing._rupees(target.price_paise + target.price_paise * GST_RATE // 100),
            ),
            archive_companies=to_archive,
            restore_companies=owners_back,
        )
        cut_off: list[_Seat] = []
        for cid in to_archive:
            await set_context(db, user_id=user_id, tenant_id=cid)
            members, _ = await org.seat_holders(db, cid)
            cut_off += [
                _Seat(cid, names[cid], member_id, member_user, is_owner)
                for member_id, member_user, status, is_owner in members
                if status == "active" and not is_owner
            ]
        used = len(seats) + len(invites)
        people = target.logins
        if people is not None and used > people:
            over = used - people
            plan.withdraw = sorted(invites, key=lambda item: -item.invite)[:over]
            over -= len(plan.withdraw)
            # Owners are never archived; their seats count in each company they own.
            plan.archive_people = [
                seat for seat in sorted(seats, key=lambda item: -item.member) if not seat.owner
            ][: max(0, over)]
        elif dormant:
            room = None if people is None else people - used
            plan.restore_people = sorted(dormant, key=lambda item: item.member)[:room]

        profiles = await _names(
            db,
            user_id,
            [seat.user for seat in plan.archive_people + plan.restore_people + cut_off],
        )
        plan.preview.loseAccess = [
            schemas.Person(name=profiles.get(seat.user, "A member"), company=seat.company)
            for seat in cut_off
        ]
        plan.preview.archivePeople = [
            schemas.Person(name=profiles.get(seat.user, "A member"), company=seat.company)
            for seat in plan.archive_people
        ]
        plan.preview.restorePeople = [
            schemas.Person(name=profiles.get(seat.user, "A member"), company=seat.company)
            for seat in plan.restore_people
        ]
        plan.preview.withdrawInvitations = [
            schemas.Person(name=item.email, company=item.company) for item in plan.withdraw
        ]
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)

    row = await billing._row(db, user_id)
    now_plan = BY_ID.get(row.plan if row else "free", BY_ID["free"])
    if now_plan.price_paise and now_plan.id != target.id:
        today = billing._today()
        invoice = await db.scalar(
            select(AccountInvoice)
            .where(
                AccountInvoice.user_id == user_id,
                AccountInvoice.plan == now_plan.id,
                AccountInvoice.status == "paid",
                AccountInvoice.period_start <= today,
                AccountInvoice.period_end >= today,
            )
            .order_by(AccountInvoice.period_start.desc(), AccountInvoice.id.desc())
        )
        if invoice is not None:
            used_days, total_days, paise = _refund_for(invoice, today)
            plan.refund = (invoice, used_days, total_days, paise)
            plan.preview.refund = schemas.RefundPreview(
                invoice=invoice.number,
                plan=now_plan.name,
                daysUsed=used_days,
                daysTotal=total_days,
                daysUnused=total_days - used_days,
                amount=billing._rupees(paise),
                method="razorpay" if invoice.payment_id and billing._razorpay() else "test",
            )
    return plan


async def _names(db: AsyncSession, user_id: int, ids: list[int]) -> dict[int, str]:
    if not ids:
        return {}
    return {uid: profile.name for uid, profile in (await user_directory(db, ids)).items()}


async def preview(
    db: AsyncSession, user_id: int, current_tenant: int | None, plan_id: str, keep: list[str]
) -> schemas.ChangePreview:
    if not await billing._owns(db, user_id):
        raise ApiError("forbidden", "The plan belongs to the Owner of the companies.", 403)
    return (await _reckon(db, user_id, current_tenant, BY_ID[plan_id], keep)).preview


async def _refund_payment(payment_id: str, paise: int) -> str | None:
    """Refunds part of a Razorpay payment; returns the refund id, or None if Razorpay refused."""
    keys = billing._razorpay()
    if keys is None or paise <= 0:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{billing.RAZORPAY}/payments/{payment_id}/refund",
                auth=keys,
                json={"amount": paise},
            )
    except httpx.HTTPError:
        return None
    if response.status_code >= 300:
        return None
    refund_id: str = response.json()["id"]
    return refund_id


async def apply(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    plan_id: str,
    keep: list[str],
    ip: str | None,
) -> None:
    """Archives, brings back and refunds as the preview said, then puts the account on the plan."""
    target = BY_ID[plan_id]
    plan = await _reckon(db, user_id, current_tenant, target, keep)
    try:
        for cid in plan.archive_companies:
            await set_context(db, user_id=user_id, tenant_id=cid)
            await org.archive_company(db, cid)
            record(db, "billing.company_archived", user_id=user_id, tenant_id=cid, ip=ip)
        for cid, member_id in plan.restore_companies:
            await set_context(db, user_id=user_id, tenant_id=cid)
            await org.set_membership_status(db, cid, [member_id], "active")
            record(db, "billing.company_restored", user_id=user_id, tenant_id=cid, ip=ip)
        for invite in plan.withdraw:
            await set_context(db, user_id=user_id, tenant_id=invite.tenant)
            await org.withdraw_invitations(db, invite.tenant, [invite.invite])
        for seats, status, action in (
            (plan.archive_people, "archived", "billing.member_archived"),
            (plan.restore_people, "active", "billing.member_restored"),
        ):
            for seat in seats:
                await set_context(db, user_id=user_id, tenant_id=seat.tenant)
                await org.set_membership_status(db, seat.tenant, [seat.member], status)
                record(
                    db,
                    action,
                    user_id=user_id,
                    tenant_id=seat.tenant,
                    ip=ip,
                    details={"membership_id": seat.member},
                )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    if plan.refund is not None:
        invoice, _, total_days, paise = plan.refund
        refund_id = (
            await _refund_payment(invoice.payment_id, paise)
            if invoice.payment_id and billing._razorpay()
            else None
        )
        status = (
            "refunded"
            if refund_id
            else "failed"
            if invoice.payment_id and billing._razorpay()
            else "test"
        )
        db.add(
            AccountRefund(
                user_id=user_id,
                invoice=invoice.number,
                plan=invoice.plan,
                days_unused=total_days - plan.refund[1],
                days_total=total_days,
                amount_paise=paise,
                status=status,
                razorpay_refund_id=refund_id,
            )
        )
        record(
            db,
            "billing.refund",
            user_id=user_id,
            ip=ip,
            details={"invoice": invoice.number, "paise": paise, "status": status},
        )
    await billing._set_plan(db, user_id, plan_id, ip)
    await db.flush()
