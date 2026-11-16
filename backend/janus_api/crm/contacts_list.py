"""List contacts with search, tag filtering and pagination."""

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.crm import schemas
from janus_api.crm.models import Contact, ContactTag, CrmTag


async def list_contacts(
    db: AsyncSession,
    tenant_id: int,
    *,
    search: str | None = None,
    tag_id: int | None = None,
    after_id: int = 0,
    limit: int = 50,
) -> list[schemas.ContactListRow]:
    q = select(Contact).where(Contact.tenant_id == tenant_id, Contact.id > after_id)

    if search:
        pattern = f"%{search}%"
        q = q.where(
            or_(
                Contact.name.ilike(pattern),
                Contact.phone_e164.ilike(pattern),
                Contact.email.ilike(pattern),
                Contact.company.ilike(pattern),
            )
        )

    if tag_id is not None:
        q = q.where(
            Contact.id.in_(
                select(ContactTag.contact_id).where(
                    ContactTag.tenant_id == tenant_id,
                    ContactTag.tag_id == tag_id,
                )
            )
        )

    q = q.order_by(Contact.id).limit(limit)
    contacts = (await db.execute(q)).scalars().all()

    contact_ids = [c.id for c in contacts]
    if not contact_ids:
        return []

    tag_rows = (
        await db.execute(
            select(ContactTag.contact_id, CrmTag.id, CrmTag.name, CrmTag.color)
            .join(CrmTag, CrmTag.id == ContactTag.tag_id)
            .where(
                ContactTag.tenant_id == tenant_id,
                ContactTag.contact_id.in_(contact_ids),
            )
        )
    ).all()
    tags_by_contact: dict[int, list[schemas.TagOut]] = {}
    for row in tag_rows:
        tags_by_contact.setdefault(row[0], []).append(
            schemas.TagOut(id=str(row[1]), name=row[2], color=row[3])
        )

    return [
        schemas.ContactListRow(
            id=str(c.id),
            name=c.name,
            phone=c.phone_e164,
            email=c.email,
            company=c.company,
            whatsappOptIn=c.whatsapp_opt_in,
            doNotContact=c.do_not_contact,
            createdAt=c.created_at,
            tags=tags_by_contact.get(c.id, []),
        )
        for c in contacts
    ]


async def count_contacts(db: AsyncSession, tenant_id: int) -> int:
    return int(
        await db.scalar(select(func.count(Contact.id)).where(Contact.tenant_id == tenant_id)) or 0
    )
