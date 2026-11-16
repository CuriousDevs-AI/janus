"""Custom fields: define and store arbitrary fields on leads, contacts and deals."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import CustomFieldDef, CustomFieldVal


def _def_out(d: CustomFieldDef) -> schemas.CustomFieldDefOut:
    return schemas.CustomFieldDefOut(
        id=str(d.id),
        entityType=d.entity_type,
        fieldName=d.field_name,
        fieldType=d.field_type,
        fieldOptions=d.field_options,
        required=d.required,
        sortOrder=d.sort_order,
        active=d.active,
        createdAt=d.created_at,
    )


async def list_field_defs(
    db: AsyncSession,
    tenant_id: int,
    entity_type: str,
) -> list[schemas.CustomFieldDefOut]:
    rows = (
        (
            await db.execute(
                select(CustomFieldDef)
                .where(
                    CustomFieldDef.tenant_id == tenant_id,
                    CustomFieldDef.entity_type == entity_type,
                    CustomFieldDef.active.is_(True),
                )
                .order_by(CustomFieldDef.sort_order, CustomFieldDef.id)
            )
        )
        .scalars()
        .all()
    )
    return [_def_out(d) for d in rows]


async def create_field_def(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    data: schemas.CustomFieldDefIn,
) -> schemas.CustomFieldDefOut:
    d = CustomFieldDef(
        tenant_id=tenant_id,
        entity_type=data.entityType,
        field_name=data.fieldName,
        field_type=data.fieldType,
        field_options=data.fieldOptions,
        required=data.required,
        sort_order=data.sortOrder,
    )
    db.add(d)
    await db.flush()
    record(
        db,
        "crm.custom_field.created",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"field": data.fieldName, "entity_type": data.entityType},
    )
    return _def_out(d)


async def update_field_def(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    field_id: int,
    data: schemas.CustomFieldDefUpdate,
) -> schemas.CustomFieldDefOut:
    d = await db.scalar(
        select(CustomFieldDef).where(
            CustomFieldDef.tenant_id == tenant_id,
            CustomFieldDef.id == field_id,
        )
    )
    if not d:
        raise ApiError("field_not_found", "Custom field definition not found", 404)
    if data.fieldName is not None:
        d.field_name = data.fieldName
    if data.fieldType is not None:
        d.field_type = data.fieldType
    if data.fieldOptions is not None:
        d.field_options = data.fieldOptions
    if data.required is not None:
        d.required = data.required
    if data.sortOrder is not None:
        d.sort_order = data.sortOrder
    if data.active is not None:
        d.active = data.active
    await db.flush()
    return _def_out(d)


async def delete_field_def(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    field_id: int,
) -> None:
    d = await db.scalar(
        select(CustomFieldDef).where(
            CustomFieldDef.tenant_id == tenant_id,
            CustomFieldDef.id == field_id,
        )
    )
    if not d:
        raise ApiError("field_not_found", "Custom field definition not found", 404)
    d.active = False
    await db.flush()


async def get_field_values(
    db: AsyncSession,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
) -> list[schemas.CustomFieldValueOut]:
    rows = (
        await db.execute(
            select(CustomFieldVal, CustomFieldDef.field_name, CustomFieldDef.field_type)
            .join(CustomFieldDef, CustomFieldDef.id == CustomFieldVal.field_def_id)
            .where(
                CustomFieldVal.tenant_id == tenant_id,
                CustomFieldVal.entity_type == entity_type,
                CustomFieldVal.entity_id == entity_id,
                CustomFieldDef.active.is_(True),
            )
        )
    ).all()
    return [
        schemas.CustomFieldValueOut(
            fieldDefId=str(v.field_def_id),
            fieldName=fname,
            fieldType=ftype,
            valueText=v.value_text,
            valueNumber=format(v.value_number, ".2f") if v.value_number is not None else None,
            valueDate=v.value_date,
        )
        for v, fname, ftype in rows
    ]


async def set_field_value(
    db: AsyncSession,
    tenant_id: int,
    field_def_id: int,
    entity_type: str,
    entity_id: int,
    data: schemas.CustomFieldValueIn,
) -> schemas.CustomFieldValueOut:
    d = await db.scalar(
        select(CustomFieldDef).where(
            CustomFieldDef.tenant_id == tenant_id,
            CustomFieldDef.id == field_def_id,
            CustomFieldDef.active.is_(True),
        )
    )
    if not d:
        raise ApiError("field_not_found", "Custom field definition not found", 404)

    existing = await db.scalar(
        select(CustomFieldVal).where(
            CustomFieldVal.tenant_id == tenant_id,
            CustomFieldVal.field_def_id == field_def_id,
            CustomFieldVal.entity_type == entity_type,
            CustomFieldVal.entity_id == entity_id,
        )
    )
    if existing:
        existing.value_text = data.valueText
        existing.value_number = data.valueNumber
        existing.value_date = data.valueDate
        existing.updated_at = now()
        await db.flush()
        v = existing
    else:
        v = CustomFieldVal(
            tenant_id=tenant_id,
            field_def_id=field_def_id,
            entity_type=entity_type,
            entity_id=entity_id,
            value_text=data.valueText,
            value_number=data.valueNumber,
            value_date=data.valueDate,
        )
        db.add(v)
        await db.flush()

    return schemas.CustomFieldValueOut(
        fieldDefId=str(v.field_def_id),
        fieldName=d.field_name,
        fieldType=d.field_type,
        valueText=v.value_text,
        valueNumber=format(v.value_number, ".2f") if v.value_number is not None else None,
        valueDate=v.value_date,
    )
