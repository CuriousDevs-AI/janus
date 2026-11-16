"""CRM tags: label leads and contacts for filtering and segmentation."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.crm import schemas
from janus_api.crm.models import Contact, ContactTag, CrmTag, Lead, LeadTag


def _out(t: CrmTag) -> schemas.TagOut:
    return schemas.TagOut(id=str(t.id), name=t.name, color=t.color)


async def list_tags(db: AsyncSession, tenant_id: int) -> list[schemas.TagOut]:
    rows = await db.scalars(
        select(CrmTag).where(CrmTag.tenant_id == tenant_id).order_by(CrmTag.name)
    )
    return [_out(t) for t in rows.all()]


async def create_tag(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    data: schemas.TagIn,
) -> schemas.TagOut:
    existing = await db.scalar(
        select(CrmTag).where(CrmTag.tenant_id == tenant_id, CrmTag.name == data.name.strip())
    )
    if existing:
        return _out(existing)
    t = CrmTag(tenant_id=tenant_id, name=data.name.strip(), color=data.color)
    db.add(t)
    await db.flush()
    record(db, "tag.created", user_id=user_id, tenant_id=tenant_id, details={"tag": t.name})
    return _out(t)


async def delete_tag(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    tag_id: int,
) -> None:
    t = await db.scalar(select(CrmTag).where(CrmTag.tenant_id == tenant_id, CrmTag.id == tag_id))
    if t is None:
        raise ApiError("not_found", "Tag not found.", 404)
    await db.delete(t)
    record(db, "tag.deleted", user_id=user_id, tenant_id=tenant_id, details={"tag": t.name})


async def tags_for_lead(db: AsyncSession, tenant_id: int, lead_id: int) -> list[schemas.TagOut]:
    rows = (
        (
            await db.execute(
                select(CrmTag)
                .join(LeadTag, LeadTag.tag_id == CrmTag.id)
                .where(LeadTag.tenant_id == tenant_id, LeadTag.lead_id == lead_id)
                .order_by(CrmTag.name)
            )
        )
        .scalars()
        .all()
    )
    return [_out(t) for t in rows]


async def tags_for_contact(
    db: AsyncSession,
    tenant_id: int,
    contact_id: int,
) -> list[schemas.TagOut]:
    rows = (
        (
            await db.execute(
                select(CrmTag)
                .join(ContactTag, ContactTag.tag_id == CrmTag.id)
                .where(ContactTag.tenant_id == tenant_id, ContactTag.contact_id == contact_id)
                .order_by(CrmTag.name)
            )
        )
        .scalars()
        .all()
    )
    return [_out(t) for t in rows]


async def tag_lead(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    lead_id: int,
    tag_id: int,
) -> None:
    lead = await db.scalar(select(Lead).where(Lead.tenant_id == tenant_id, Lead.id == lead_id))
    if lead is None:
        raise ApiError("not_found", "Lead not found.", 404)
    tag = await db.scalar(select(CrmTag).where(CrmTag.tenant_id == tenant_id, CrmTag.id == tag_id))
    if tag is None:
        raise ApiError("not_found", "Tag not found.", 404)
    existing = await db.scalar(
        select(LeadTag).where(
            LeadTag.tenant_id == tenant_id,
            LeadTag.lead_id == lead_id,
            LeadTag.tag_id == tag_id,
        )
    )
    if existing:
        return
    db.add(LeadTag(tenant_id=tenant_id, lead_id=lead_id, tag_id=tag_id))
    await db.flush()
    record(
        db,
        "lead.tagged",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"lead_id": lead_id, "tag": tag.name},
    )


async def untag_lead(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    lead_id: int,
    tag_id: int,
) -> None:
    await db.execute(
        delete(LeadTag).where(
            LeadTag.tenant_id == tenant_id,
            LeadTag.lead_id == lead_id,
            LeadTag.tag_id == tag_id,
        )
    )
    record(
        db,
        "lead.untagged",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"lead_id": lead_id, "tag_id": tag_id},
    )


async def tag_contact(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    contact_id: int,
    tag_id: int,
) -> None:
    contact = await db.scalar(
        select(Contact).where(Contact.tenant_id == tenant_id, Contact.id == contact_id)
    )
    if contact is None:
        raise ApiError("not_found", "Contact not found.", 404)
    tag = await db.scalar(select(CrmTag).where(CrmTag.tenant_id == tenant_id, CrmTag.id == tag_id))
    if tag is None:
        raise ApiError("not_found", "Tag not found.", 404)
    existing = await db.scalar(
        select(ContactTag).where(
            ContactTag.tenant_id == tenant_id,
            ContactTag.contact_id == contact_id,
            ContactTag.tag_id == tag_id,
        )
    )
    if existing:
        return
    db.add(ContactTag(tenant_id=tenant_id, contact_id=contact_id, tag_id=tag_id))
    await db.flush()
    record(
        db,
        "contact.tagged",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"contact_id": contact_id, "tag": tag.name},
    )


async def untag_contact(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    contact_id: int,
    tag_id: int,
) -> None:
    await db.execute(
        delete(ContactTag).where(
            ContactTag.tenant_id == tenant_id,
            ContactTag.contact_id == contact_id,
            ContactTag.tag_id == tag_id,
        )
    )
    record(
        db,
        "contact.untagged",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"contact_id": contact_id, "tag_id": tag_id},
    )
