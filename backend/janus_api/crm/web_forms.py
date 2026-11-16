"""Web forms: embeddable lead capture forms with public submission."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import WebForm


def _out(f: WebForm) -> schemas.WebFormOut:
    return schemas.WebFormOut(
        id=str(f.id),
        name=f.name,
        slug=f.slug,
        fieldsConfig=f.fields_config or [],
        redirectUrl=f.redirect_url,
        notifyEmail=f.notify_email,
        active=f.active,
        submissionCount=f.submission_count,
        createdBy=str(f.created_by),
        createdAt=f.created_at,
        updatedAt=f.updated_at,
    )


async def list_forms(
    db: AsyncSession,
    tenant_id: int,
) -> list[schemas.WebFormOut]:
    rows = (
        (
            await db.execute(
                select(WebForm).where(WebForm.tenant_id == tenant_id).order_by(WebForm.name)
            )
        )
        .scalars()
        .all()
    )
    return [_out(f) for f in rows]


async def create_form(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    data: schemas.WebFormIn,
) -> schemas.WebFormOut:
    existing = await db.scalar(select(WebForm).where(WebForm.slug == data.slug))
    if existing:
        raise ApiError("slug_taken", "A form with this slug already exists", 409)

    fields = [fc.model_dump() for fc in data.fieldsConfig]
    f = WebForm(
        tenant_id=tenant_id,
        name=data.name,
        slug=data.slug,
        fields_config=fields,
        redirect_url=data.redirectUrl,
        notify_email=data.notifyEmail,
        created_by=user_id,
    )
    db.add(f)
    await db.flush()
    record(
        db,
        "crm.web_form.created",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"form": data.name, "slug": data.slug},
    )
    return _out(f)


async def update_form(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    form_id: int,
    data: schemas.WebFormUpdate,
) -> schemas.WebFormOut:
    f = await db.scalar(
        select(WebForm).where(
            WebForm.tenant_id == tenant_id,
            WebForm.id == form_id,
        )
    )
    if not f:
        raise ApiError("form_not_found", "Web form not found", 404)
    if data.name is not None:
        f.name = data.name
    if data.fieldsConfig is not None:
        f.fields_config = [fc.model_dump() for fc in data.fieldsConfig]
    if data.redirectUrl is not None:
        f.redirect_url = data.redirectUrl
    if data.notifyEmail is not None:
        f.notify_email = data.notifyEmail
    if data.active is not None:
        f.active = data.active
    f.updated_at = now()
    await db.flush()
    return _out(f)


async def submit_form(
    db: AsyncSession,
    form_slug: str,
    form_data: dict[str, str],
) -> tuple[int, int]:
    """Submit to a public form. Returns (tenant_id, lead_id)."""
    f = await db.scalar(
        select(WebForm).where(
            WebForm.slug == form_slug,
            WebForm.active.is_(True),
        )
    )
    if not f:
        raise ApiError("form_not_found", "Form not found or inactive", 404)

    mapped: dict[str, str] = {}
    for field_config in f.fields_config or []:
        field_name = str(field_config.get("name", ""))
        map_to = str(field_config.get("mapTo", field_name))
        value = form_data.get(field_name, "")
        if value:
            mapped[map_to] = value

    from janus_api.crm.service import create_manual_lead, normalize_phone

    phone = mapped.get("phone", "")
    if phone:
        phone = normalize_phone(phone) or phone

    lead_in = schemas.ManualLeadIn(
        name=mapped.get("name", ""),
        phone=phone or None,
        email=mapped.get("email") or None,
        company=mapped.get("company", ""),
        requirement=mapped.get("requirement", mapped.get("message", "")),
    )
    lead_out, _ = await create_manual_lead(
        db,
        f.tenant_id,
        f.created_by,
        ["*"],
        lead_in,
        f"webform-{f.slug}-{int(now().timestamp())}",
    )

    f.submission_count = (f.submission_count or 0) + 1
    f.updated_at = now()
    await db.flush()
    await db.commit()

    return f.tenant_id, int(lead_out.id)
