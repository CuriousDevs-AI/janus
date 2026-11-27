"""CRM activity tracking: calls, meetings, emails, tasks and notes on leads, deals and contacts."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from janus_api.audit.service import record
from janus_api.auth.models import User
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import Activity, Contact, Deal, Lead


def _out(
    a: Activity,
    owner_name: str | None = None,
    contact_name: str | None = None,
    lead_name: str | None = None,
) -> schemas.ActivityOut:
    return schemas.ActivityOut(
        id=str(a.id),
        kind=a.kind,
        subject=a.subject,
        description=a.description,
        leadId=str(a.lead_id) if a.lead_id else None,
        leadName=lead_name,
        dealId=str(a.deal_id) if a.deal_id else None,
        contactId=str(a.contact_id),
        contactName=contact_name,
        ownerId=str(a.owner_id) if a.owner_id else None,
        ownerName=owner_name,
        dueAt=a.due_at,
        completedAt=a.completed_at,
        outcome=a.outcome,
        durationSeconds=a.duration_seconds,
        createdAt=a.created_at,
    )


async def list_activities(
    db: AsyncSession,
    tenant_id: int,
    *,
    contact_id: int | None = None,
    lead_id: int | None = None,
    deal_id: int | None = None,
    after_id: int = 0,
    limit: int = 50,
    crm_id: int | None = None,
    kind: str | None = None,
) -> list[schemas.ActivityOut]:
    c_alias = aliased(Contact)
    l_alias = aliased(Lead)
    query = (
        select(
            Activity,
            User.name.label("owner_name"),
            c_alias.name.label("contact_name"),
            l_alias.requirement.label("lead_name"),
        )
        .outerjoin(User, User.id == Activity.owner_id)
        .outerjoin(
            c_alias,
            (c_alias.id == Activity.contact_id)
            & (c_alias.tenant_id == Activity.tenant_id),
        )
        .outerjoin(
            l_alias,
            (l_alias.id == Activity.lead_id)
            & (l_alias.tenant_id == Activity.tenant_id),
        )
        .where(Activity.tenant_id == tenant_id)
    )
    if crm_id is not None:
        query = query.where(l_alias.crm_id == crm_id)
    if kind is not None:
        query = query.where(Activity.kind == kind)
    if contact_id is not None:
        query = query.where(Activity.contact_id == contact_id)
    if lead_id is not None:
        query = query.where(Activity.lead_id == lead_id)
    if deal_id is not None:
        query = query.where(Activity.deal_id == deal_id)
    if after_id:
        query = query.where(Activity.id > after_id)
    rows = (
        await db.execute(
            query.order_by(Activity.created_at.desc()).limit(limit)
        )
    ).all()
    return [
        _out(a, oname, cname, lname)
        for a, oname, cname, lname in rows
    ]


async def create_activity(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    data: schemas.ActivityIn,
) -> schemas.ActivityOut:
    contact_id = int(data.contactId)
    contact = await db.scalar(
        select(Contact).where(Contact.tenant_id == tenant_id, Contact.id == contact_id)
    )
    if contact is None:
        raise ApiError("not_found", "Contact not found.", 404)

    lead_id: int | None = int(data.leadId) if data.leadId else None
    if lead_id is not None:
        lead = await db.scalar(select(Lead).where(Lead.tenant_id == tenant_id, Lead.id == lead_id))
        if lead is None:
            raise ApiError("not_found", "Lead not found.", 404)
        lead.last_activity_at = now()

    deal_id: int | None = int(data.dealId) if data.dealId else None
    if deal_id is not None:
        deal = await db.scalar(select(Deal).where(Deal.tenant_id == tenant_id, Deal.id == deal_id))
        if deal is None:
            raise ApiError("not_found", "Deal not found.", 404)

    a = Activity(
        tenant_id=tenant_id,
        kind=data.kind,
        subject=data.subject.strip(),
        description=data.description.strip(),
        lead_id=lead_id,
        deal_id=deal_id,
        contact_id=contact_id,
        owner_id=user_id,
        due_at=data.dueAt,
        outcome=data.outcome,
        duration_seconds=data.durationSeconds,
    )
    db.add(a)
    await db.flush()
    record(
        db,
        "activity.created",
        user_id=user_id,
        tenant_id=tenant_id,
        details={
            "activity_id": a.id, "kind": a.kind,
            "subject": a.subject, "contact_id": contact_id,
        },
    )
    owner = await db.get(User, user_id)
    return _out(a, owner.name if owner else None)


async def update_activity(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    activity_id: int,
    data: schemas.ActivityUpdate,
) -> schemas.ActivityOut:
    a = await db.scalar(
        select(Activity)
        .where(Activity.tenant_id == tenant_id, Activity.id == activity_id)
        .with_for_update()
    )
    if a is None:
        raise ApiError("not_found", "Activity not found.", 404)
    if data.subject is not None:
        a.subject = data.subject.strip()
    if data.description is not None:
        a.description = data.description.strip()
    if data.dueAt is not None:
        a.due_at = data.dueAt
    if data.outcome is not None:
        a.outcome = data.outcome
    if data.durationSeconds is not None:
        a.duration_seconds = data.durationSeconds
    await db.flush()
    record(
        db,
        "activity.updated",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"activity_id": a.id},
    )
    owner = await db.get(User, a.owner_id) if a.owner_id else None
    return _out(a, owner.name if owner else None)


async def complete_activity(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    activity_id: int,
    data: schemas.ActivityCompleteIn,
) -> schemas.ActivityOut:
    a = await db.scalar(
        select(Activity)
        .where(Activity.tenant_id == tenant_id, Activity.id == activity_id)
        .with_for_update()
    )
    if a is None:
        raise ApiError("not_found", "Activity not found.", 404)
    if a.completed_at is not None:
        raise ApiError("already_completed", "This activity is already completed.", 409)
    a.completed_at = now()
    if data.outcome is not None:
        a.outcome = data.outcome
    if data.durationSeconds is not None:
        a.duration_seconds = data.durationSeconds
    if a.lead_id:
        lead = await db.scalar(
            select(Lead).where(Lead.tenant_id == tenant_id, Lead.id == a.lead_id)
        )
        if lead:
            lead.last_activity_at = now()
    await db.flush()
    record(
        db,
        "activity.completed",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"activity_id": a.id, "outcome": a.outcome or ""},
    )
    owner = await db.get(User, a.owner_id) if a.owner_id else None
    return _out(a, owner.name if owner else None)


async def delete_activity(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    activity_id: int,
) -> None:
    a = await db.scalar(
        select(Activity).where(Activity.tenant_id == tenant_id, Activity.id == activity_id)
    )
    if a is None:
        raise ApiError("not_found", "Activity not found.", 404)
    await db.delete(a)
    record(
        db,
        "activity.deleted",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"activity_id": activity_id},
    )
