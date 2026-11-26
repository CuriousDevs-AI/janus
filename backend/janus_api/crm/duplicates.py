"""Duplicate detection and merging for contacts."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import Contact, DuplicateGroup, Lead


def _out(
    g: DuplicateGroup,
    entities: list[schemas.DuplicateEntity] | None = None,
) -> schemas.DuplicateGroupOut:
    return schemas.DuplicateGroupOut(
        id=str(g.id),
        entityType=g.entity_type,
        matchField=g.match_field,
        matchValue=g.match_value,
        entityIds=[str(eid) for eid in (g.entity_ids or [])],
        entities=entities or [],
        status=g.status,
        mergedIntoId=str(g.merged_into_id) if g.merged_into_id else None,
        createdAt=g.created_at,
        resolvedAt=g.resolved_at,
    )


async def _enrich_groups(
    db: AsyncSession,
    tenant_id: int,
    groups: list[DuplicateGroup],
) -> list[schemas.DuplicateGroupOut]:
    all_ids: set[int] = set()
    for g in groups:
        all_ids.update(int(eid) for eid in (g.entity_ids or []))
    if not all_ids:
        return [_out(g) for g in groups]

    contacts = {
        c.id: c
        for c in (
            await db.execute(
                select(Contact).where(
                    Contact.tenant_id == tenant_id,
                    Contact.id.in_(all_ids),
                )
            )
        )
        .scalars()
        .all()
    }

    lead_counts: dict[int, int] = {}
    if contacts:
        rows = (
            await db.execute(
                select(Lead.contact_id, func.count(Lead.id))
                .where(Lead.tenant_id == tenant_id, Lead.contact_id.in_(all_ids))
                .group_by(Lead.contact_id)
            )
        ).all()
        lead_counts = {int(cid): int(cnt) for cid, cnt in rows}

    result = []
    for g in groups:
        entities = []
        for eid in g.entity_ids or []:
            c = contacts.get(int(eid))
            if c:
                entities.append(schemas.DuplicateEntity(
                    id=str(c.id),
                    name=c.name or c.phone_e164 or c.email or f"Contact #{c.id}",
                    phone=c.phone_e164,
                    email=c.email,
                    company=c.company,
                    leadCount=lead_counts.get(int(eid), 0),
                ))
            else:
                entities.append(schemas.DuplicateEntity(id=str(eid), name=f"#{eid}"))
        result.append(_out(g, entities))
    return result


async def find_duplicates(
    db: AsyncSession,
    tenant_id: int,
    entity_type: str,
) -> list[schemas.DuplicateGroupOut]:
    pending = (
        (
            await db.execute(
                select(DuplicateGroup).where(
                    DuplicateGroup.tenant_id == tenant_id,
                    DuplicateGroup.entity_type == entity_type,
                    DuplicateGroup.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )
    if pending:
        return await _enrich_groups(db, tenant_id, list(pending))

    if entity_type == "contact":
        phone_dupes = (
            await db.execute(
                select(Contact.phone_e164, func.array_agg(Contact.id))
                .where(
                    Contact.tenant_id == tenant_id,
                    Contact.phone_e164.is_not(None),
                    Contact.phone_e164 != "",
                )
                .group_by(Contact.phone_e164)
                .having(func.count(Contact.id) > 1)
            )
        ).all()

        email_dupes = (
            await db.execute(
                select(Contact.email, func.array_agg(Contact.id))
                .where(
                    Contact.tenant_id == tenant_id,
                    Contact.email.is_not(None),
                    Contact.email != "",
                )
                .group_by(Contact.email)
                .having(func.count(Contact.id) > 1)
            )
        ).all()

        groups = []
        seen_values: set[str] = set()

        for value, ids in phone_dupes:
            if value in seen_values:
                continue
            seen_values.add(value)
            g = DuplicateGroup(
                tenant_id=tenant_id,
                entity_type="contact",
                match_field="phone",
                match_value=value,
                entity_ids=sorted(ids),
            )
            db.add(g)
            groups.append(g)

        for value, ids in email_dupes:
            if value in seen_values:
                continue
            seen_values.add(value)
            g = DuplicateGroup(
                tenant_id=tenant_id,
                entity_type="contact",
                match_field="email",
                match_value=value,
                entity_ids=sorted(ids),
            )
            db.add(g)
            groups.append(g)

        await db.flush()
        return await _enrich_groups(db, tenant_id, groups)

    return []


async def merge_contacts(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    group_id: int,
    winner_id: int,
) -> schemas.MergeResult:
    g = await db.scalar(
        select(DuplicateGroup).where(
            DuplicateGroup.tenant_id == tenant_id,
            DuplicateGroup.id == group_id,
            DuplicateGroup.status == "pending",
        )
    )
    if not g:
        raise ApiError("group_not_found", "Duplicate group not found or already resolved", 404)

    entity_ids = [int(eid) for eid in (g.entity_ids or [])]
    if winner_id not in entity_ids:
        raise ApiError("invalid_winner", "Winner must be one of the duplicate entities", 422)

    loser_ids = [eid for eid in entity_ids if eid != winner_id]
    merged = 0

    for loser_id in loser_ids:
        leads = (
            (
                await db.execute(
                    select(Lead).where(
                        Lead.tenant_id == tenant_id,
                        Lead.contact_id == loser_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        for lead in leads:
            lead.contact_id = winner_id
        merged += len(leads)

    g.status = "merged"
    g.merged_into_id = winner_id
    g.resolved_at = now()
    await db.flush()

    record(
        db,
        "crm.duplicates.merged",
        user_id=user_id,
        tenant_id=tenant_id,
        details={
            "group_id": str(group_id),
            "winner_id": str(winner_id),
            "loser_ids": ",".join(str(lid) for lid in loser_ids),
            "leads_moved": merged,
        },
    )

    return schemas.MergeResult(merged=merged, winnerId=str(winner_id))


async def dismiss_duplicate(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    group_id: int,
) -> None:
    g = await db.scalar(
        select(DuplicateGroup).where(
            DuplicateGroup.tenant_id == tenant_id,
            DuplicateGroup.id == group_id,
            DuplicateGroup.status == "pending",
        )
    )
    if not g:
        raise ApiError("group_not_found", "Duplicate group not found or already resolved", 404)

    g.status = "dismissed"
    g.resolved_at = now()
    await db.flush()
