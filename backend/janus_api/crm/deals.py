"""The first pipeline shares a lead's contact and ownership; one deal per lead."""

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.models import AuditLog
from janus_api.audit.service import record
from janus_api.auth.service import Actor
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import Contact, Deal, Lead
from janus_api.crm.service import visible_owners


async def query_for(db: AsyncSession, actor: Actor) -> Select[tuple[Deal, Lead, Contact]]:
    tenant_id = actor.session.tenant_id
    owners = await visible_owners(db, tenant_id, actor.user.id, actor.permissions)
    query = (
        select(Deal, Lead, Contact)
        .join(Lead, (Lead.id == Deal.lead_id) & (Lead.tenant_id == Deal.tenant_id))
        .join(Contact, (Contact.id == Lead.contact_id) & (Contact.tenant_id == Lead.tenant_id))
    )
    query = query.where(Deal.tenant_id == tenant_id)
    return query if owners is None else query.where(Lead.owner_id.in_(owners))


def output(deal: Deal, lead: Lead, contact: Contact) -> schemas.DealOut:
    return schemas.DealOut.model_validate(
        dict(
            id=str(deal.id),
            leadId=str(lead.id),
            customerId=str(contact.id),
            customerName=contact.name or contact.phone_e164 or contact.email or "Customer",
            company=contact.company,
            phone=contact.phone_e164,
            ownerId=str(lead.owner_id) if lead.owner_id else None,
            name=deal.name,
            amount=format(deal.amount, ".2f"),
            stage=deal.stage,
            expectedCloseAt=deal.expected_close_at,
            lostReason=deal.lost_reason,
            version=deal.version,
            createdAt=deal.created_at,
            updatedAt=deal.updated_at,
        )
    )


async def list_deals(
    db: AsyncSession, actor: Actor, after_id: int, limit: int
) -> list[schemas.DealOut]:
    query = (await query_for(db, actor)).where(Deal.id > after_id).order_by(Deal.id).limit(limit)
    return [output(*row) for row in (await db.execute(query)).all()]


async def get(
    db: AsyncSession, actor: Actor, deal_id: int, *, lock: bool = False
) -> tuple[Deal, Lead, Contact]:
    query = (await query_for(db, actor)).where(Deal.id == deal_id)
    if lock:
        query = query.with_for_update(of=Deal)
    row = (await db.execute(query)).first()
    if row is None:
        raise ApiError("not_found", "Deal not found.", 404)
    return row[0], row[1], row[2]


async def create(
    db: AsyncSession, actor: Actor, lead_id: int, data: schemas.DealValues
) -> schemas.DealOut:
    tenant_id = actor.session.tenant_id
    owners = await visible_owners(db, tenant_id, actor.user.id, actor.permissions)
    query = select(Lead).where(Lead.tenant_id == tenant_id, Lead.id == lead_id)
    if owners is not None:
        query = query.where(Lead.owner_id.in_(owners))
    # Serializes duplicate creation requests for the same lead, including lost HTTP responses.
    lead = await db.scalar(query.with_for_update())
    if lead is None:
        raise ApiError("not_found", "Lead not found.", 404)
    contact = await db.get(Contact, lead.contact_id)
    assert contact is not None
    deal = await db.scalar(select(Deal).where(Deal.tenant_id == tenant_id, Deal.lead_id == lead_id))
    if deal is not None:
        return output(deal, lead, contact)
    deal = Deal(
        tenant_id=tenant_id,
        lead_id=lead_id,
        name=data.name,
        amount=data.amount,
        stage=data.stage,
        expected_close_at=data.expectedCloseAt,
        lost_reason=data.lostReason,
    )
    db.add(deal)
    lead.stage, lead.last_activity_at = data.stage, now()
    await db.flush()
    record(
        db,
        "deal.created",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        details={
            "deal_id": deal.id,
            "lead_id": lead_id,
            "stage": deal.stage,
            "name": deal.name,
            "expected_close_at": str(deal.expected_close_at or ""),
            "lost_reason": deal.lost_reason,
            "amount": format(deal.amount, ".2f"),
        },
    )
    return output(deal, lead, contact)


async def update(
    db: AsyncSession, actor: Actor, deal_id: int, data: schemas.DealUpdate
) -> schemas.DealOut:
    deal, lead, contact = await get(db, actor, deal_id, lock=True)
    if deal.version != data.version:
        raise ApiError("stale_deal", "This deal changed. Refresh it before saving again.", 409)
    before = (deal.name, deal.amount, deal.stage, deal.expected_close_at, deal.lost_reason)
    after = (data.name, data.amount, data.stage, data.expectedCloseAt, data.lostReason)
    if before == after:
        return output(deal, lead, contact)
    old_stage = deal.stage
    deal.name, deal.amount, deal.stage, deal.expected_close_at, deal.lost_reason = after
    deal.version += 1
    deal.updated_at = lead.last_activity_at = now()
    lead.stage = deal.stage
    record(
        db,
        "deal.updated",
        user_id=actor.user.id,
        tenant_id=actor.session.tenant_id,
        details={
            "deal_id": deal.id,
            "from_stage": old_stage,
            "to_stage": deal.stage,
            "name": deal.name,
            "amount": format(deal.amount, ".2f"),
            "expected_close_at": str(deal.expected_close_at or ""),
            "lost_reason": deal.lost_reason,
            "version": deal.version,
        },
    )
    await db.flush()
    return output(deal, lead, contact)


async def events(
    db: AsyncSession, actor: Actor, deal_id: int, before_id: int | None, limit: int
) -> list[schemas.DealEvent]:
    await get(db, actor, deal_id)
    query = select(AuditLog).where(
        AuditLog.tenant_id == actor.session.tenant_id,
        AuditLog.action.in_(["deal.created", "deal.updated"]),
        AuditLog.details["deal_id"].astext == str(deal_id),
    )
    if before_id:
        query = query.where(AuditLog.id < before_id)
    rows = (await db.scalars(query.order_by(AuditLog.id.desc()).limit(limit))).all()
    return [
        schemas.DealEvent(
            id=str(row.id),
            action=row.action,
            userId=str(row.user_id) if row.user_id else None,
            details={
                key: str(value) if key in {"deal_id", "lead_id"} else value
                for key, value in row.details.items()
            },
            createdAt=row.created_at,
        )
        for row in rows
    ]
