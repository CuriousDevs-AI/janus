import hashlib
import json
import secrets
from typing import cast

import phonenumbers
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth.models import User
from janus_api.core.errors import ApiError, ProcessingError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import Contact, Deal, Lead
from janus_api.crm.schemas import CapturedContact, ContactOut, LeadOut, LeadSource, ManualLeadIn
from janus_api.org.service import active_member, teammate_user_ids
from janus_api.sources.models import IngestReceipt, SourceConnection


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
    actor_id: int | None = None,
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
        user_id=actor_id,
        tenant_id=tenant_id,
        details={
            "lead_id": lead.id,
            "contact_id": contact.id,
            "receipt_id": receipt_id,
            "result": result,
        },
    )
    return contact.id, lead.id, result


_LEGACY_SOURCE_MAP: dict[str, LeadSource] = {
    "email": "manual",
    "linkedin": "manual",
    "meta_ads": "manual",
    "facebook": "meta_lead_ads",
    "instagram": "meta_lead_ads",
}


def canonical_source(value: str) -> LeadSource:
    """Keep older captured values inside the current lead-source contract."""
    if value in _LEGACY_SOURCE_MAP:
        return _LEGACY_SOURCE_MAP[value]
    if value in {
        "website",
        "whatsapp",
        "phone_call",
        "webhook",
        "api",
        "csv_import",
        "meta_lead_ads",
        "indiamart",
        "manual",
        "referral",
    }:
        return cast(LeadSource, value)
    return "manual"


def lead_out(lead: Lead, contact: Contact | None = None, owner: User | None = None) -> LeadOut:
    return LeadOut(
        id=str(lead.id),
        customerId=str(lead.contact_id),
        contactName=contact.name if contact else "",
        phone=contact.phone_e164 if contact else None,
        email=contact.email if contact else None,
        company=contact.company if contact else "",
        whatsappOptIn=contact.whatsapp_opt_in if contact else False,
        doNotContact=contact.do_not_contact if contact else False,
        consentSource=contact.consent_source if contact else None,
        consentUpdatedAt=contact.consent_updated_at if contact else None,
        source=canonical_source(lead.source),
        stage=lead.stage,
        ownerId=str(lead.owner_id) if lead.owner_id else None,
        ownerName=owner.name if owner else None,
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
    rows = (
        await db.execute(
            query.join(
                Contact,
                (Contact.id == Lead.contact_id) & (Contact.tenant_id == Lead.tenant_id),
            )
            .outerjoin(User, User.id == Lead.owner_id)
            .with_only_columns(Lead, Contact, User)
            .order_by(Lead.id)
            .limit(limit)
        )
    ).all()
    leads = [lead for lead, _contact, _owner in rows]
    contacts = {lead.id: contact for lead, contact, _owner in rows}
    owners_by_lead = {lead.id: owner for lead, _contact, owner in rows}
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
        lead_out(lead, contacts[lead.id], owners_by_lead[lead.id]).model_copy(
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
    owner = await db.get(User, lead.owner_id) if lead.owner_id else None
    return lead_out(lead, contact, owner)


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
        whatsappOptIn=contact.whatsapp_opt_in,
        doNotContact=contact.do_not_contact,
        consentSource=contact.consent_source,
        consentUpdatedAt=contact.consent_updated_at,
    )


async def update_contact(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    contact_id: int,
    data: schemas.ContactUpdate,
) -> ContactOut:
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    visible = select(Lead.id).where(Lead.contact_id == Contact.id, Lead.tenant_id == tenant_id)
    if owners is not None:
        visible = visible.where(Lead.owner_id.in_(owners))
    contact = await db.scalar(
        select(Contact)
        .where(Contact.id == contact_id, Contact.tenant_id == tenant_id, visible.exists())
        .with_for_update()
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
    await db.flush()
    record(
        db,
        "contact.updated",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"contact_id": contact.id},
    )
    return ContactOut(
        id=str(contact.id),
        name=contact.name,
        phone=contact.phone_e164,
        email=contact.email,
        company=contact.company,
        whatsappOptIn=contact.whatsapp_opt_in,
        doNotContact=contact.do_not_contact,
        consentSource=contact.consent_source,
        consentUpdatedAt=contact.consent_updated_at,
    )


async def update_contact_consent(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    contact_id: int,
    data: schemas.ContactConsentUpdate,
) -> ContactOut:
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    visible = select(Lead.id).where(Lead.contact_id == Contact.id, Lead.tenant_id == tenant_id)
    if owners is not None:
        visible = visible.where(Lead.owner_id.in_(owners))
    contact = await db.scalar(
        select(Contact)
        .where(Contact.id == contact_id, Contact.tenant_id == tenant_id, visible.exists())
        .with_for_update()
    )
    if contact is None:
        raise ApiError("not_found", "Contact not found.", 404)
    if data.doNotContact and data.whatsappOptIn:
        raise ApiError(
            "consent_conflict",
            "A contact cannot be opted in and suppressed at the same time.",
            422,
        )
    contact.whatsapp_opt_in = data.whatsappOptIn
    contact.do_not_contact = data.doNotContact
    contact.consent_source = data.consentSource.strip() if data.consentSource else None
    contact.consent_updated_at = now()
    await db.flush()
    record(
        db,
        "contact.consent_updated",
        user_id=user_id,
        tenant_id=tenant_id,
        details={
            "contact_id": contact.id,
            "whatsapp_opt_in": contact.whatsapp_opt_in,
            "do_not_contact": contact.do_not_contact,
            "source": contact.consent_source or "",
        },
    )
    return ContactOut(
        id=str(contact.id),
        name=contact.name,
        phone=contact.phone_e164,
        email=contact.email,
        company=contact.company,
        whatsappOptIn=contact.whatsapp_opt_in,
        doNotContact=contact.do_not_contact,
        consentSource=contact.consent_source,
        consentUpdatedAt=contact.consent_updated_at,
    )


async def manual_connection(db: AsyncSession, tenant_id: int) -> SourceConnection:
    """The company's connection for leads typed in by hand, created when first needed."""
    connection = await db.scalar(
        select(SourceConnection).where(
            SourceConnection.tenant_id == tenant_id, SourceConnection.kind == "manual"
        )
    )
    if connection is None:
        connection = SourceConnection(
            tenant_id=tenant_id,
            name="Manual entry",
            description="Enquiries typed in by a person in Janus.",
            kind="manual",
            preset="manual",
            field_mapping=[],
            public_key=f"manual-{tenant_id}-{secrets.token_hex(8)}",
            status="connected",
        )
        db.add(connection)
        await db.flush()
    return connection


async def create_manual_lead(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    data: ManualLeadIn,
    idempotency_key: str,
) -> tuple[LeadOut, bool]:
    """Creates a lead for the person who typed it in, once per key. Returns (lead, created)."""
    connection = await manual_connection(db, tenant_id)
    fields = data.model_dump(mode="json")
    existing = await db.scalar(
        select(IngestReceipt).where(
            IngestReceipt.tenant_id == tenant_id,
            IngestReceipt.connection_id == connection.id,
            IngestReceipt.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        replayed = await db.scalar(
            select(Lead.id).where(Lead.tenant_id == tenant_id, Lead.receipt_id == existing.id)
        )
        if replayed is None:
            raise ApiError("not_found", "Lead not found.", 404)
        return await get_lead(db, tenant_id, user_id, permissions, replayed), False
    payload = json.dumps(fields, sort_keys=True).encode()
    receipt = IngestReceipt(
        tenant_id=tenant_id,
        connection_id=connection.id,
        idempotency_key=idempotency_key,
        payload_hash=hashlib.sha256(payload).hexdigest(),
        received_day=now().date(),
    )
    db.add(receipt)
    await db.flush()
    try:
        _, lead_id, _ = await capture(
            db, tenant_id, receipt.id, fields, user_id, source="manual", actor_id=user_id
        )
    except ProcessingError as error:
        raise ApiError(
            "invalid_lead", _LEAD_PROBLEMS.get(error.code, "Check the lead and try again."), 422
        ) from error
    return await get_lead(db, tenant_id, user_id, permissions, lead_id), True


_LEAD_PROBLEMS = {
    "missing_contact_identity": "Enter a mobile number or an email, so the lead can be reached.",
    "contact_identity_conflict": "Another contact already uses this mobile or email.",
    "invalid_contact_fields": "Check the lead's details.",
    "invalid_phone": "Enter a mobile number with its country code, such as +91 98111 22334.",
}
