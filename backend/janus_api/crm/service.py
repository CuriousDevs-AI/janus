import hashlib
import json
import secrets
from datetime import datetime
from typing import cast

import phonenumbers
from pydantic import ValidationError
from sqlalchemy import case, func, literal, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.models import AuditLog
from janus_api.audit.service import record
from janus_api.auth.models import User
from janus_api.business.service import enqueue_event
from janus_api.core.errors import ApiError, ProcessingError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import Contact, CustomerNote, Deal, Lead, LeadNote
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
    crm_id: int | None = None,
) -> tuple[int, int, str]:
    try:
        data = CapturedContact.model_validate(fields)
    except ValidationError as error:
        for e in error.errors():
            if "email" in (e.get("loc") or ()):
                raise ProcessingError("invalid_email") from error
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
        contact.name = data.name or contact.name
        contact.company = data.company or contact.company
        contact.phone_e164 = contact.phone_e164 or phone
        contact.email = contact.email or email
    await db.flush()
    if owner_id is not None and not await active_member(db, tenant_id, owner_id):
        owner_id = None
    if crm_id is None:
        from janus_api.crm.crm_workspace import ensure_default_crm

        crm_id = await ensure_default_crm(db, tenant_id, actor_id or 0)
    lead = Lead(
        tenant_id=tenant_id,
        crm_id=crm_id,
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
    await enqueue_event(db, tenant_id, "lead_created", {"lead_id": lead.id})
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
        crmId=str(lead.crm_id),
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
        nextFollowUpOn=lead.next_follow_up_on,
        lostCategory=lead.lost_category,
        lostReason=lead.lost_reason,
        lostAt=lead.lost_at,
    )


def set_lost(
    item: Lead | Deal, stage: str, category: str | None, note: str, when: datetime
) -> None:
    """Records why a lead or deal was lost and when; it keeps the first day it was lost."""
    if stage != "lost":
        item.lost_category, item.lost_reason, item.lost_at = None, "", None
        return
    item.lost_category, item.lost_reason = category, note
    if item.lost_at is None:
        item.lost_at = when


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
    search: str | None = None,
    stage: str | None = None,
    source: str | None = None,
    owner_id: int | None = None,
    tag_id: int | None = None,
    crm_id: int | None = None,
    sort: str | None = None,
) -> list[LeadOut]:
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    query = select(Lead).where(Lead.tenant_id == tenant_id)
    if after_id:
        query = query.where(Lead.id > after_id)
    if crm_id is not None:
        query = query.where(Lead.crm_id == crm_id)
    if owners is not None:
        query = query.where(Lead.owner_id.in_(owners))
    if lead_id is not None:
        query = query.where(Lead.id == lead_id)
    if stage is not None:
        query = query.where(Lead.stage == stage)
    if source is not None:
        query = query.where(Lead.source == source)
    if owner_id is not None:
        query = query.where(Lead.owner_id == owner_id)
    if tag_id is not None:
        from janus_api.crm.models import LeadTag

        tag_exists = (
            select(LeadTag.id)
            .where(
                LeadTag.tenant_id == Lead.tenant_id,
                LeadTag.lead_id == Lead.id,
                LeadTag.tag_id == tag_id,
            )
            .exists()
        )
        query = query.where(tag_exists)
    if search:
        pattern = f"%{search}%"
        # Match contact fields or any follow-up note body for this lead.
        note_match = (
            select(LeadNote.id)
            .where(
                LeadNote.tenant_id == Lead.tenant_id,
                LeadNote.lead_id == Lead.id,
                LeadNote.body.ilike(pattern),
            )
            .exists()
        )
        query = query.where(
            Contact.name.ilike(pattern)
            | Contact.phone_e164.ilike(pattern)
            | Contact.email.ilike(pattern)
            | Contact.company.ilike(pattern)
            | Lead.requirement.ilike(pattern)
            | note_match
        )
    rows = (
        await db.execute(
            query.join(
                Contact,
                (Contact.id == Lead.contact_id) & (Contact.tenant_id == Lead.tenant_id),
            )
            .outerjoin(User, User.id == Lead.owner_id)
            .with_only_columns(Lead, Contact, User)
            .order_by(
                Lead.next_follow_up_on.asc().nulls_last() if sort == "follow_up"
                else Lead.last_activity_at.desc() if sort == "last_activity"
                else Lead.id.asc() if sort == "oldest"
                else Lead.id.desc()
            )
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
    old_stage = lead.stage
    if old_stage == "converted":
        raise ApiError(
            "lead_converted",
            "This lead was converted to a deal. Track progress on the deal instead.",
            409,
        )
    lead.stage = data.stage
    if data.stage == "lost":
        lead.next_follow_up_on = None
    lead.last_activity_at = now()
    set_lost(lead, data.stage, data.lostCategory, data.lostReason, lead.last_activity_at)
    await db.flush()
    record(
        db,
        "lead.updated",
        user_id=user_id,
        tenant_id=tenant_id,
        details={
            "lead_id": lead.id,
            "from_stage": old_stage,
            "to_stage": lead.stage,
            **({"lost_category": lead.lost_category} if lead.lost_category else {}),
        },
    )
    owner = await db.get(User, lead.owner_id) if lead.owner_id else None
    return lead_out(lead, contact, owner)


async def lead_events(
    db: AsyncSession,
    tenant_id: int,
    lead_id: int,
    limit: int = 50,
) -> list[schemas.LeadEvent]:
    rows = (
        await db.execute(
            select(AuditLog, User.name)
            .outerjoin(User, User.id == AuditLog.user_id)
            .where(
                AuditLog.tenant_id == tenant_id,
                AuditLog.action.in_(
                    ["lead.created", "lead.updated", "lead.captured"]
                ),
                AuditLog.details["lead_id"].astext == str(lead_id),
            )
            .order_by(AuditLog.id.desc())
            .limit(limit)
        )
    ).all()
    return [
        schemas.LeadEvent(
            id=str(row.id),
            action=row.action,
            userId=str(row.user_id) if row.user_id else None,
            userName=user_name,
            details={
                k: str(v) if k == "lead_id" else v
                for k, v in row.details.items()
            },
            createdAt=row.created_at,
        )
        for row, user_name in rows
    ]


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


async def _existing_active_leads(
    db: AsyncSession, tenant_id: int, phone: str | None, email: str | None
) -> list[tuple[int, str, str]]:
    """Active leads for a contact identified by phone or email: (lead_id, name, stage)."""
    contact: Contact | None = None
    if phone:
        contact = await db.scalar(
            select(Contact).where(Contact.tenant_id == tenant_id, Contact.phone_e164 == phone)
        )
    if contact is None and email:
        contact = await db.scalar(
            select(Contact).where(Contact.tenant_id == tenant_id, Contact.email == email)
        )
    if contact is None:
        return []
    rows = (
        await db.execute(
            select(Lead.id, Contact.name, Lead.stage)
            .join(Contact, (Contact.id == Lead.contact_id) & (Contact.tenant_id == Lead.tenant_id))
            .where(
                Lead.tenant_id == tenant_id,
                Lead.contact_id == contact.id,
                Lead.stage.not_in(("won", "lost")),
            )
            .order_by(Lead.id.desc())
            .limit(5)
        )
    ).all()
    return [(int(row[0]), str(row[1] or "Unnamed"), str(row[2])) for row in rows]


async def create_manual_lead(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    data: ManualLeadIn,
    idempotency_key: str,
    crm_id: int | None = None,
    source: str = "manual",
) -> tuple[LeadOut, bool]:
    """Creates a lead for the person who typed it in, once per key. Returns (lead, created)."""
    connection = await manual_connection(db, tenant_id)
    fields = data.model_dump(mode="json", exclude={"skipDuplicateCheck"})
    # Idempotency: an exact retry with the same key returns the earlier lead, no duplicate check.
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
    # Warn when a contact already has active leads, unless the user acknowledged it.
    if not data.skipDuplicateCheck:
        try:
            phone = normalize_phone(data.phone)
        except ProcessingError:
            phone = None
        email = str(data.email).casefold() if data.email else None
        dupes = await _existing_active_leads(db, tenant_id, phone, email)
        if dupes:
            names = ", ".join(f"{name} (stage: {stage})" for _, name, stage in dupes[:3])
            raise ApiError(
                "duplicate_contact_leads",
                f"This contact already has active leads: {names}. "
                "Add anyway if this is a separate enquiry.",
                409,
            )
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
            db, tenant_id, receipt.id, fields, user_id, source=source, actor_id=user_id,
            crm_id=crm_id,
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
    "invalid_email": "Enter a valid email address, such as name@company.com.",
}


# Stage ordering for the "furthest stage" aggregation in the customer list.
_STAGE_ORDER = {
    "lost": 0,
    "new": 1,
    "contacted": 2,
    "qualified": 3,
    "converted": 4,
    "won": 5,
}


async def list_customers(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    after_id: int,
    limit: int,
    query: str | None = None,
    filter_kind: str = "all",
    crm_id: int | None = None,
) -> list[schemas.CustomerListRow]:
    """Paged customer list with lead/deal summaries, respecting lead-owner visibility."""
    owners = await visible_owners(db, tenant_id, user_id, permissions)

    # Stage rank for furthest-stage aggregation.
    stage_rank = case(
        *[(Lead.stage == stage, literal(rank)) for stage, rank in _STAGE_ORDER.items()],
        else_=literal(0),
    )

    # Base query: group by contact, aggregate leads.
    base = (
        select(
            Contact.id.label("contact_id"),
            Contact.name,
            Contact.phone_e164,
            Contact.email,
            Contact.company,
            func.count(Lead.id).label("lead_count"),
            func.coalesce(func.sum(Deal.amount), 0).label("deal_value"),
            func.max(stage_rank).label("max_stage_rank"),
            func.max(Lead.last_activity_at).label("last_activity_at"),
        )
        .select_from(Lead)
        .join(Contact, (Contact.id == Lead.contact_id) & (Contact.tenant_id == Lead.tenant_id))
        .outerjoin(
            Deal,
            (Deal.lead_id == Lead.id) & (Deal.tenant_id == Lead.tenant_id) & (Deal.stage != "lost"),
        )
        .where(Lead.tenant_id == tenant_id)
    )
    if crm_id is not None:
        base = base.where(Lead.crm_id == crm_id)
    if owners is not None:
        base = base.where(Lead.owner_id.in_(owners))

    # Text search across contact fields.
    if query:
        pattern = f"%{query}%"
        base = base.where(
            Contact.name.ilike(pattern)
            | Contact.phone_e164.ilike(pattern)
            | Contact.email.ilike(pattern)
            | Contact.company.ilike(pattern)
        )

    base = base.group_by(Contact.id)

    # Filter.
    if filter_kind == "active":
        base = base.having(func.bool_or(Lead.stage.not_in(("won", "lost"))))
    elif filter_kind == "won":
        base = base.having(func.bool_or(Lead.stage == "won"))
    elif filter_kind == "needs_attention":
        from datetime import UTC, datetime, timedelta

        cutoff = datetime.now(UTC) - timedelta(days=3)
        base = base.having(
            func.bool_or((Lead.last_activity_at <= cutoff) & Lead.stage.not_in(("won", "lost")))
        )

    sub = base.subquery()

    # Pagination by contact_id.
    outer = (
        select(sub)
        .where(sub.c.contact_id > after_id)
        .order_by(sub.c.last_activity_at.desc().nullslast(), sub.c.contact_id)
        .limit(limit)
    )
    rows = (await db.execute(outer)).all()

    # Reverse map stage rank to label.
    rank_to_stage = {v: k for k, v in _STAGE_ORDER.items()}

    # Resolve owner for each contact's most recent lead.
    contact_ids = [row.contact_id for row in rows]
    owner_info: dict[int, tuple[str | None, str | None]] = {}
    if contact_ids:
        # For each contact, find the latest lead's owner.
        latest_leads = (
            await db.execute(
                select(Lead.contact_id, Lead.owner_id, User.name)
                .outerjoin(User, User.id == Lead.owner_id)
                .where(
                    Lead.tenant_id == tenant_id,
                    Lead.contact_id.in_(contact_ids),
                )
                .distinct(Lead.contact_id)
                .order_by(Lead.contact_id, Lead.last_activity_at.desc())
            )
        ).all()
        for cid, oid, oname in latest_leads:
            owner_info[int(cid)] = (str(oid) if oid else None, oname)

    return [
        schemas.CustomerListRow(
            contactId=str(row.contact_id),
            name=row.name or row.phone_e164 or row.email or f"Customer #{row.contact_id}",
            phone=row.phone_e164,
            email=row.email,
            company=row.company or "",
            leadCount=int(row.lead_count),
            dealValue=format(row.deal_value, ".2f"),
            stage=rank_to_stage.get(int(row.max_stage_rank), "new"),
            ownerId=owner_info.get(int(row.contact_id), (None, None))[0],
            ownerName=owner_info.get(int(row.contact_id), (None, None))[1],
            lastActivityAt=row.last_activity_at,
        )
        for row in rows
    ]


async def _visible_lead(
    db: AsyncSession, tenant_id: int, user_id: int, permissions: list[str], lead_id: int
) -> Lead:
    """The lead, if this person may see it; the same rule as the lead list."""
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    query = select(Lead).where(Lead.tenant_id == tenant_id, Lead.id == lead_id)
    if owners is not None:
        query = query.where(Lead.owner_id.in_(owners))
    lead = await db.scalar(query)
    if lead is None:
        raise ApiError("not_found", "Lead not found.", 404)
    return lead


async def list_notes(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    lead_id: int,
    after_id: int = 0,
    limit: int = 50,
) -> list[schemas.NoteOut]:
    lead = await _visible_lead(db, tenant_id, user_id, permissions, lead_id)
    q = (
        select(LeadNote, User.name)
        .outerjoin(User, User.id == LeadNote.author_id)
        .where(LeadNote.tenant_id == tenant_id, LeadNote.lead_id == lead.id)
        .order_by(LeadNote.created_at.desc(), LeadNote.id.desc())
        .limit(limit)
    )
    if after_id:
        q = q.where(LeadNote.id < after_id)
    rows = (await db.execute(q)).all()
    return [
        schemas.NoteOut(
            id=str(note.id),
            body=note.body,
            author=name,
            nextFollowUpOn=note.next_follow_up_on,
            createdAt=note.created_at,
        )
        for note, name in rows
    ]


async def add_note(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    lead_id: int,
    data: schemas.NoteIn,
) -> schemas.NoteOut:
    """Writes down a follow-up: it counts as activity and sets when to follow up next."""
    lead = await _visible_lead(db, tenant_id, user_id, permissions, lead_id)
    note = LeadNote(
        tenant_id=tenant_id,
        lead_id=lead.id,
        author_id=user_id,
        body=data.body.strip(),
        next_follow_up_on=data.nextFollowUpOn,
    )
    db.add(note)
    lead.last_activity_at = now()
    lead.next_follow_up_on = data.nextFollowUpOn
    # A new lead someone has spoken to has been contacted; later stages are left as they are.
    if lead.stage == "new":
        lead.stage = "contacted"
    await db.flush()
    record(
        db,
        "lead.followed_up",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"lead_id": lead.id, "next": str(data.nextFollowUpOn or "")},
    )
    author = await db.get(User, user_id)
    return schemas.NoteOut(
        id=str(note.id),
        body=note.body,
        author=author.name if author else None,
        nextFollowUpOn=note.next_follow_up_on,
        createdAt=note.created_at or now(),
    )


async def assign_leads(
    db: AsyncSession, tenant_id: int, user_id: int, data: schemas.AssignIn
) -> schemas.AssignOut:
    """Gives leads to an active member of the company, or takes them from their owner. The caller
    holds leads:assign, so may hand any lead in the company to anyone in it."""
    from janus_api.org import overview as org

    ids = [int(item) for item in data.leadIds if item.isdigit()]
    if len(ids) != len(data.leadIds):
        raise ApiError("invalid_lead", "Choose the leads to assign.", 422)
    owner: User | None = None
    if data.ownerId is not None:
        if (
            not data.ownerId.isdigit()
            or await org.active_role(db, tenant_id, int(data.ownerId)) is None
        ):
            raise ApiError(
                "invalid_owner", "Choose someone who is an active member of this company.", 422
            )
        owner = await db.get(User, int(data.ownerId))
    leads = (
        await db.scalars(
            select(Lead).where(Lead.tenant_id == tenant_id, Lead.id.in_(ids)).with_for_update()
        )
    ).all()
    if len(leads) != len(ids):
        raise ApiError("not_found", "One of these leads no longer exists.", 404)
    for lead in leads:
        lead.owner_id = owner.id if owner else None
    await db.flush()
    record(
        db,
        "lead.assigned",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"leads": len(leads), "owner_id": owner.id if owner else ""},
    )
    return schemas.AssignOut(assigned=len(leads), ownerName=owner.name if owner else None)


# ---------------------------------------------------------------------------
# Customer notes
# ---------------------------------------------------------------------------


async def _visible_contact(
    db: AsyncSession, tenant_id: int, user_id: int, permissions: list[str], contact_id: int
) -> Contact:
    """The contact, if this person may see at least one of its leads."""
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
    return contact


async def list_customer_notes(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    contact_id: int,
    after_id: int = 0,
    limit: int = 50,
) -> list[schemas.CustomerNoteOut]:
    contact = await _visible_contact(db, tenant_id, user_id, permissions, contact_id)
    q = (
        select(CustomerNote, User.name)
        .outerjoin(User, User.id == CustomerNote.author_id)
        .where(CustomerNote.tenant_id == tenant_id, CustomerNote.contact_id == contact.id)
        .order_by(CustomerNote.created_at.desc(), CustomerNote.id.desc())
        .limit(limit)
    )
    if after_id:
        q = q.where(CustomerNote.id < after_id)
    rows = (await db.execute(q)).all()
    return [
        schemas.CustomerNoteOut(
            id=str(note.id),
            body=note.body,
            author=name,
            createdAt=note.created_at,
        )
        for note, name in rows
    ]


async def add_customer_note(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    contact_id: int,
    data: schemas.CustomerNoteIn,
) -> schemas.CustomerNoteOut:
    contact = await _visible_contact(db, tenant_id, user_id, permissions, contact_id)
    note = CustomerNote(
        tenant_id=tenant_id,
        contact_id=contact.id,
        author_id=user_id,
        body=data.body.strip(),
    )
    db.add(note)
    await db.flush()
    record(
        db,
        "contact.note_added",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"contact_id": contact.id, "note_id": note.id},
    )
    author = await db.get(User, user_id)
    return schemas.CustomerNoteOut(
        id=str(note.id),
        body=note.body,
        author=author.name if author else None,
        createdAt=note.created_at or now(),
    )


# ---------------------------------------------------------------------------
# Lead & contact detail (360-degree views)
# ---------------------------------------------------------------------------


async def lead_detail(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    lead_id: int,
) -> schemas.LeadDetailOut:
    from janus_api.crm import activities as act_svc
    from janus_api.crm import tags as tag_svc

    lead_out = await get_lead(db, tenant_id, user_id, permissions, lead_id)
    notes = await list_notes(db, tenant_id, user_id, permissions, lead_id, limit=50)
    activities_list = await act_svc.list_activities(
        db,
        tenant_id,
        lead_id=lead_id,
        limit=50,
    )
    tags_list = await tag_svc.tags_for_lead(db, tenant_id, lead_id)

    deal_out: schemas.DealOut | None = None
    deal = await db.scalar(select(Deal).where(Deal.tenant_id == tenant_id, Deal.lead_id == lead_id))
    if deal:
        from janus_api.crm.deals import output as deal_output

        lead_row = await db.scalar(
            select(Lead).where(Lead.id == lead_id, Lead.tenant_id == tenant_id)
        )
        contact = (
            await db.scalar(
                select(Contact).where(
                    Contact.id == lead_row.contact_id, Contact.tenant_id == tenant_id
                )
            )
            if lead_row
            else None
        )
        owner = await db.get(User, lead_row.owner_id) if lead_row and lead_row.owner_id else None
        deal_out = deal_output(deal, lead_row, contact, owner) if lead_row and contact else None

    return schemas.LeadDetailOut(
        lead=lead_out,
        deal=deal_out,
        notes=notes,
        activities=activities_list,
        tags=tags_list,
    )


async def contact_detail(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    contact_id: int,
) -> schemas.ContactDetailOut:
    from decimal import Decimal

    from janus_api.crm import activities as act_svc
    from janus_api.crm import tags as tag_svc

    contact = await _visible_contact(db, tenant_id, user_id, permissions, contact_id)
    contact_out = schemas.ContactOut(
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

    leads_rows = (
        (
            await db.execute(
                select(Lead)
                .where(Lead.tenant_id == tenant_id, Lead.contact_id == contact_id)
                .order_by(Lead.created_at.desc())
            )
        )
        .scalars()
        .all()
    )

    total_deal_value = Decimal(0)
    open_deal_value = Decimal(0)
    lead_summaries: list[schemas.ContactLeadSummary] = []

    for lead in leads_rows:
        deal = await db.scalar(
            select(Deal).where(Deal.tenant_id == tenant_id, Deal.lead_id == lead.id)
        )
        summary = schemas.ContactLeadSummary(
            id=str(lead.id),
            crmId=str(lead.crm_id),
            stage=lead.stage,
            source=lead.source,
            requirement=lead.requirement,
            createdAt=lead.created_at,
            dealId=str(deal.id) if deal else None,
            dealName=deal.name if deal else None,
            dealAmount=format(deal.amount, ".2f") if deal else None,
            dealStage=deal.stage if deal else None,
        )
        lead_summaries.append(summary)
        if deal:
            total_deal_value += deal.amount
            if deal.stage not in ("won", "lost"):
                open_deal_value += deal.amount

    notes = await list_customer_notes(db, tenant_id, user_id, permissions, contact_id, limit=50)
    activities_list = await act_svc.list_activities(
        db,
        tenant_id,
        contact_id=contact_id,
        limit=50,
    )
    tags_list = await tag_svc.tags_for_contact(db, tenant_id, contact_id)

    lead_ids = [lead.id for lead in leads_rows]
    lead_notes_out: list[schemas.LeadNoteWithLead] = []
    if lead_ids:
        ln_rows = (
            await db.execute(
                select(LeadNote, User.name)
                .outerjoin(User, User.id == LeadNote.author_id)
                .where(LeadNote.tenant_id == tenant_id, LeadNote.lead_id.in_(lead_ids))
                .order_by(LeadNote.created_at.desc())
                .limit(50)
            )
        ).all()
        lead_notes_out = [
            schemas.LeadNoteWithLead(
                id=str(ln.id),
                leadId=str(ln.lead_id),
                body=ln.body,
                author=author_name,
                nextFollowUpOn=ln.next_follow_up_on,
                createdAt=ln.created_at,
            )
            for ln, author_name in ln_rows
        ]

    return schemas.ContactDetailOut(
        contact=contact_out,
        leads=lead_summaries,
        notes=notes,
        activities=activities_list,
        leadNotes=lead_notes_out,
        tags=tags_list,
        totalDealValue=format(total_deal_value, ".2f"),
        openDealValue=format(open_deal_value, ".2f"),
    )


# ---------------------------------------------------------------------------
# Bulk operations
# ---------------------------------------------------------------------------


async def bulk_stage(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    data: schemas.BulkStageIn,
) -> schemas.BulkResult:
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    ids = [int(x) for x in data.leadIds if x.isdigit()]
    query = select(Lead).where(Lead.tenant_id == tenant_id, Lead.id.in_(ids)).with_for_update()
    if owners is not None:
        query = query.where(Lead.owner_id.in_(owners))
    leads = (await db.scalars(query)).all()
    for lead in leads:
        if lead.stage == "converted":
            continue
        old_stage = lead.stage
        lead.stage = data.stage
        lead.last_activity_at = now()
        set_lost(lead, data.stage, data.lostCategory, data.lostReason, lead.last_activity_at)
        record(
            db,
            "lead.updated",
            user_id=user_id,
            tenant_id=tenant_id,
            details={
                "lead_id": lead.id,
                "from_stage": old_stage,
                "to_stage": lead.stage,
            },
        )
    await db.flush()
    return schemas.BulkResult(affected=len(leads))


async def bulk_delete(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    permissions: list[str],
    data: schemas.BulkDeleteIn,
) -> schemas.BulkResult:
    owners = await visible_owners(db, tenant_id, user_id, permissions)
    ids = [int(x) for x in data.leadIds if x.isdigit()]
    query = select(Lead).where(Lead.tenant_id == tenant_id, Lead.id.in_(ids)).with_for_update()
    if owners is not None:
        query = query.where(Lead.owner_id.in_(owners))
    leads = (await db.scalars(query)).all()
    # Only delete leads without deals.
    deleted = 0
    for lead in leads:
        has_deal = await db.scalar(
            select(Deal.id).where(Deal.tenant_id == tenant_id, Deal.lead_id == lead.id)
        )
        if has_deal is None:
            await db.delete(lead)
            deleted += 1
    await db.flush()
    record(
        db,
        "lead.bulk_deleted",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"count": deleted},
    )
    return schemas.BulkResult(affected=deleted)
