"""Email sequences: multi-step follow-up workflows."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import EmailSequence


def _out(s: EmailSequence) -> schemas.SequenceOut:
    return schemas.SequenceOut(
        id=str(s.id),
        name=s.name,
        description=s.description,
        steps=s.steps or [],
        active=s.active,
        createdBy=str(s.created_by),
        createdAt=s.created_at,
        updatedAt=s.updated_at,
    )


async def list_sequences(
    db: AsyncSession,
    tenant_id: int,
) -> list[schemas.SequenceOut]:
    rows = (
        (
            await db.execute(
                select(EmailSequence)
                .where(
                    EmailSequence.tenant_id == tenant_id,
                    EmailSequence.active.is_(True),
                )
                .order_by(EmailSequence.name)
            )
        )
        .scalars()
        .all()
    )
    return [_out(s) for s in rows]


async def create_sequence(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    data: schemas.SequenceIn,
) -> schemas.SequenceOut:
    steps = [step.model_dump() for step in data.steps]
    s = EmailSequence(
        tenant_id=tenant_id,
        name=data.name,
        description=data.description or None,
        steps=steps,
        created_by=user_id,
    )
    db.add(s)
    await db.flush()
    record(
        db,
        "crm.sequence.created",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"sequence": data.name, "steps": len(steps)},
    )
    return _out(s)


async def update_sequence(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    sequence_id: int,
    data: schemas.SequenceUpdate,
) -> schemas.SequenceOut:
    s = await db.scalar(
        select(EmailSequence).where(
            EmailSequence.tenant_id == tenant_id,
            EmailSequence.id == sequence_id,
        )
    )
    if not s:
        raise ApiError("sequence_not_found", "Email sequence not found", 404)
    if data.name is not None:
        s.name = data.name
    if data.description is not None:
        s.description = data.description or None
    if data.steps is not None:
        s.steps = [step.model_dump() for step in data.steps]
    if data.active is not None:
        s.active = data.active
    s.updated_at = now()
    await db.flush()
    return _out(s)


async def delete_sequence(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    sequence_id: int,
) -> None:
    s = await db.scalar(
        select(EmailSequence).where(
            EmailSequence.tenant_id == tenant_id,
            EmailSequence.id == sequence_id,
        )
    )
    if not s:
        raise ApiError("sequence_not_found", "Email sequence not found", 404)
    s.active = False
    s.updated_at = now()
    await db.flush()
