"""Email templates with variable substitution."""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import EmailTemplate


def _out(t: EmailTemplate) -> schemas.EmailTemplateOut:
    return schemas.EmailTemplateOut(
        id=str(t.id),
        name=t.name,
        subject=t.subject,
        bodyHtml=t.body_html,
        variables=t.variables or [],
        category=t.category,
        active=t.active,
        createdBy=str(t.created_by),
        createdAt=t.created_at,
        updatedAt=t.updated_at,
    )


async def list_templates(
    db: AsyncSession,
    tenant_id: int,
    category: str | None = None,
) -> list[schemas.EmailTemplateOut]:
    q = select(EmailTemplate).where(
        EmailTemplate.tenant_id == tenant_id,
        EmailTemplate.active.is_(True),
    )
    if category:
        q = q.where(EmailTemplate.category == category)
    q = q.order_by(EmailTemplate.name)
    rows = (await db.execute(q)).scalars().all()
    return [_out(t) for t in rows]


async def create_template(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    data: schemas.EmailTemplateIn,
) -> schemas.EmailTemplateOut:
    t = EmailTemplate(
        tenant_id=tenant_id,
        name=data.name,
        subject=data.subject,
        body_html=data.bodyHtml,
        variables=data.variables,
        category=data.category,
        created_by=user_id,
    )
    db.add(t)
    await db.flush()
    record(
        db,
        "crm.email_template.created",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"template": data.name},
    )
    return _out(t)


async def update_template(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    template_id: int,
    data: schemas.EmailTemplateUpdate,
) -> schemas.EmailTemplateOut:
    t = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.tenant_id == tenant_id,
            EmailTemplate.id == template_id,
        )
    )
    if not t:
        raise ApiError("template_not_found", "Email template not found", 404)
    if data.name is not None:
        t.name = data.name
    if data.subject is not None:
        t.subject = data.subject
    if data.bodyHtml is not None:
        t.body_html = data.bodyHtml
    if data.variables is not None:
        t.variables = data.variables
    if data.category is not None:
        t.category = data.category
    if data.active is not None:
        t.active = data.active
    t.updated_at = now()
    await db.flush()
    return _out(t)


async def delete_template(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    template_id: int,
) -> None:
    t = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.tenant_id == tenant_id,
            EmailTemplate.id == template_id,
        )
    )
    if not t:
        raise ApiError("template_not_found", "Email template not found", 404)
    t.active = False
    t.updated_at = now()
    await db.flush()


async def render_template(
    db: AsyncSession,
    tenant_id: int,
    template_id: int,
    context: dict[str, str],
) -> schemas.TemplateRenderOut:
    t = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.tenant_id == tenant_id,
            EmailTemplate.id == template_id,
            EmailTemplate.active.is_(True),
        )
    )
    if not t:
        raise ApiError("template_not_found", "Email template not found", 404)

    def replace(text: str) -> str:
        def sub(m: re.Match[str]) -> str:
            key = m.group(1).strip()
            return context.get(key, m.group(0))

        return re.sub(r"\{\{(\w+)\}\}", sub, text)

    return schemas.TemplateRenderOut(
        subject=replace(t.subject),
        bodyHtml=replace(t.body_html),
    )
