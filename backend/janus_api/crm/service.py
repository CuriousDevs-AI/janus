import phonenumbers
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError, ProcessingError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import Contact, Deal, Lead
from janus_api.crm.schemas import CapturedContact, ContactOut, LeadOut
from janus_api.org.service import active_member, teammate_user_ids


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    try:
        number = phonenumbers.parse(value, "IN")
    except phonenumbers.NumberParseException as error:
        raise ProcessingError("invalid_phone") from error
    if not phonenumbers.is_valid_number(number) or number.extension:
        raise ProcessingError("invalid_phone")
    return str(phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164))


async def capture(
    db: AsyncSession,
    tenant_id: int,
    receipt_id: int,
    fields: dict[str, str],
    owner_id: int | None,
    source: str = "webhook",
) -> tuple[int, int, str]:
    try:
        data = CapturedContact.model_validate(fields)
    except ValidationError as error:
        raise ProcessingError("invalid_contact_fields") from error
    phone = normalize_phone(data.phone)
    email = str(data.email).casefold() if data.email else None
    if not phone and not email:
        raise ProcessingError("missing_contact_identity")
    # ponytail: serialize merges per tenant; use identity-specific locks if throughput requires it.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": f"crm:{tenant_id}"}
    )
    by_phone = (
        await db.scalar(
            select(Contact).where(Contact.tenant_id == tenant_id, Contact.phone_e164 == phone)
        )
        if phone
        else None
    )
    by_email = (
        await db.scalar(
            select(Contact).where(Contact.tenant_id == tenant_id, Contact.email == email)
        )
        if email
        else None
    )
    if by_phone and by_email and by_phone.id != by_email.id:
        raise ProcessingError("contact_identity_conflict")
    contact = by_phone or by_email
    result = "merged" if contact else "new_profile"
    if contact is None:
        contact = Contact(
            tenant_id=tenant_id, name=data.name, phone_e164=phone, email=email, company=data.company
        )
        db.add(contact)
    else:
        # Conflicting identifiers require a human decision; never silently join two people.
        if (phone and contact.phone_e164 and phone != contact.phone_e164) or (
            email and contact.email and email != contact.email
        ):
            raise ProcessingError("contact_identity_conflict")
        contact.name = contact.name or data.name
        contact.company = contact.company or data.company
        contact.phone_e164 = contact.phone_e164 or phone
        contact.email = contact.email or email
    await db.flush()
    if owner_id is not None and not await active_member(db, tenant_id, owner_id):
        owner_id = None
    lead = Lead(
        tenant_id=tenant_id,
        contact_id=contact.id,
        receipt_id=receipt_id,
        owner_id=owner_id,
        source=source,
        recording_reference=data.recording_reference,
        requirement=data.requirement,
        campaign=data.campaign,
        recording_url=str(data.recording_url) if data.recording_url else None,
    )
    db.add(lead)
    await db.flush()
    record(
        db,
        "lead.captured",
        tenant_id=tenant_id,
        details={
            "lead_id": lead.id,
            "contact_id": contact.id,
            "receipt_id": receipt_id,
            "result": result,
        },
    )
    return contact.id, lead.id, result


def lead_out(lead: Lead) -> LeadOut:
    return LeadOut(
        id=str(lead.id),
        customerId=str(lead.contact_id),
        source=lead.source,
        stage=lead.stage,
        ownerId=str(lead.owner_id) if lead.owner_id else None,
        requirement=lead.requirement,
        campaign=lead.campaign,
        recordingUrl=lead.recording_url,
        recordingReference=lead.recording_reference,
        createdAt=lead.created_at,
        lastActivityAt=lead.last_activity_at,
    )


async def visible_owners(
    db: AsyncSession, tenant_id: int, user_id: int, permissions: list[str]
) -> list[int] | None:
    if "leads:read_all" in permissions:
        return None
    owners = [user_id]
    if "leads:read_team" in permissions:
        owners.extend(await teammate_user_ids(db, tenant_id, user_id))
    return owners


async def list_leads(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    after_id: int,
    limit: int,
    lead_id: int | None = None,
) -> list[LeadOut]:
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    query = select(Lead).where(Lead.tenant_id == tenant_id, Lead.id > after_id)
    if owners is not None:
        query = query.where(Lead.owner_id.in_(owners))
    if lead_id is not None:
        query = query.where(Lead.id == lead_id)
    leads = list((await db.scalars(query.order_by(Lead.id).limit(limit))).all())
    deals = {
        lead_id: deal_id
        for lead_id, deal_id in (
            await db.execute(
                select(Deal.lead_id, Deal.id).where(
                    Deal.tenant_id == tenant_id, Deal.lead_id.in_([lead.id for lead in leads])
                )
            )
        ).all()
    }
    return [
        lead_out(lead).model_copy(
            update={"dealId": str(deals[lead.id]) if lead.id in deals else None}
        )
        for lead in leads
    ]


async def get_lead(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    lead_id: int,
) -> LeadOut:
    leads = await list_leads(db, tenant_id, user_id, permissions, 0, 1, lead_id)
    if not leads:
        raise ApiError("not_found", "Lead not found.", 404)
    return leads[0]


async def update_lead(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    lead_id: int,
    data: schemas.LeadUpdate,
) -> LeadOut:
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    query = select(Lead).where(Lead.tenant_id == tenant_id, Lead.id == lead_id)
    if owners is not None:
        query = query.where(Lead.owner_id.in_(owners))
    lead = await db.scalar(query.with_for_update())
    if lead is None:
        raise ApiError("not_found", "Lead not found.", 404)
    contact = await db.scalar(
        select(Contact).where(Contact.tenant_id == tenant_id, Contact.id == lead.contact_id)
    )
    if contact is None:
        raise ApiError("not_found", "Contact not found.", 404)

    try:
        phone = normalize_phone(data.phone)
    except ProcessingError as error:
        raise ApiError("invalid_phone", "Enter a valid phone number.", 422) from error
    email = str(data.email).casefold() if data.email else None
    if not phone and not email:
        raise ApiError("missing_contact_identity", "Add a phone number or email.", 422)
    if phone:
        conflict = await db.scalar(
            select(Contact.id).where(
                Contact.tenant_id == tenant_id,
                Contact.phone_e164 == phone,
                Contact.id != contact.id,
            )
        )
        if conflict is not None:
            raise ApiError(
                "contact_identity_conflict",
                "That phone number belongs to another contact.",
                409,
            )
    if email:
        conflict = await db.scalar(
            select(Contact.id).where(
                Contact.tenant_id == tenant_id,
                Contact.email == email,
                Contact.id != contact.id,
            )
        )
        if conflict is not None:
            raise ApiError(
                "contact_identity_conflict",
                "That email belongs to another contact.",
                409,
            )

    contact.name = data.name.strip()
    contact.phone_e164 = phone
    contact.email = email
    contact.company = data.company.strip()
    lead.requirement = data.requirement.strip()
    lead.stage = data.stage
    lead.last_activity_at = now()
    await db.flush()
    record(
        db,
        "lead.updated",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"lead_id": lead.id, "stage": lead.stage},
    )
    return lead_out(lead)


async def delete_lead(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    lead_id: int,
) -> None:
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    query = select(Lead).where(Lead.tenant_id == tenant_id, Lead.id == lead_id)
    if owners is not None:
        query = query.where(Lead.owner_id.in_(owners))
    lead = await db.scalar(query.with_for_update())
    if lead is None:
        raise ApiError("not_found", "Lead not found.", 404)
    if await db.scalar(select(Deal.id).where(Deal.tenant_id == tenant_id, Deal.lead_id == lead_id)):
        raise ApiError(
            "lead_has_deal",
            "This lead has a deal. Delete or close the deal before deleting the lead.",
            409,
        )
    await db.delete(lead)
    record(
        db,
        "lead.deleted",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"lead_id": lead_id},
    )


async def get_contact(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    contact_id: int,
) -> ContactOut:
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    visible = select(Lead.id).where(Lead.contact_id == Contact.id, Lead.tenant_id == tenant_id)
    if owners is not None:
        visible = visible.where(Lead.owner_id.in_(owners))
    contact = await db.scalar(
        select(Contact).where(
            Contact.id == contact_id, Contact.tenant_id == tenant_id, visible.exists()
        )
    )
    if contact is None:
        raise ApiError("not_found", "Contact not found.", 404)
    return ContactOut(
        id=str(contact.id),
        name=contact.name,
        phone=contact.phone_e164,
        email=contact.email,
        company=contact.company,
    )
