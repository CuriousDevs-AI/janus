"""CRM workspace CRUD: list, create, update, archive, member management."""

import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth.models import User
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.crm import schemas
from janus_api.crm.models import CrmMember, CrmWorkspace, Deal, Lead
from janus_api.org.models import Membership

DEFAULT_STAGES = [
    {"key": "new", "label": "New", "color": "bg-slate-500", "probability": 10},
    {"key": "qualified", "label": "Qualified", "color": "bg-cyan-500", "probability": 20},
    {"key": "demo", "label": "Demo", "color": "bg-indigo-500", "probability": 40},
    {"key": "proposal", "label": "Proposal", "color": "bg-amber-500", "probability": 60},
    {"key": "negotiation", "label": "Negotiation", "color": "bg-orange-500", "probability": 75},
    {"key": "approval", "label": "Approval", "color": "bg-purple-500", "probability": 90},
    {"key": "won", "label": "Won", "color": "bg-emerald-500", "probability": 100},
    {"key": "lost", "label": "Lost", "color": "bg-red-500", "probability": 0},
]


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:60] or "crm"


def _out(ws: CrmWorkspace) -> schemas.CrmWorkspaceOut:
    return schemas.CrmWorkspaceOut(
        id=str(ws.id),
        name=ws.name,
        slug=ws.slug,
        description=ws.description,
        pipelineStages=ws.pipeline_stages,
        winStage=ws.win_stage,
        isDefault=ws.is_default,
        active=ws.active,
        createdAt=ws.created_at,
        updatedAt=ws.updated_at,
    )


def _member_out(m: CrmMember, name: str | None = None) -> schemas.CrmMemberOut:
    return schemas.CrmMemberOut(
        id=str(m.id),
        crmId=str(m.crm_id),
        membershipId=str(m.membership_id),
        memberName=name,
        role=m.role,
        createdAt=m.created_at,
    )


async def list_crms(
    db: AsyncSession, tenant_id: int, active_only: bool = True
) -> list[schemas.CrmWorkspaceOut]:
    lead_count = (
        select(func.count(Lead.id))
        .where(Lead.tenant_id == tenant_id, Lead.crm_id == CrmWorkspace.id)
        .correlate(CrmWorkspace)
        .scalar_subquery()
    )
    deal_count = (
        select(func.count(Deal.id))
        .where(Deal.tenant_id == tenant_id, Deal.crm_id == CrmWorkspace.id)
        .correlate(CrmWorkspace)
        .scalar_subquery()
    )
    member_count = (
        select(func.count(CrmMember.id))
        .where(CrmMember.crm_id == CrmWorkspace.id)
        .correlate(CrmWorkspace)
        .scalar_subquery()
    )
    q = (
        select(
            CrmWorkspace,
            lead_count.label("lc"),
            deal_count.label("dc"),
            member_count.label("mc"),
            User.name.label("creator_name"),
        )
        .outerjoin(User, User.id == CrmWorkspace.created_by)
        .where(CrmWorkspace.tenant_id == tenant_id)
    )
    if active_only:
        q = q.where(CrmWorkspace.active.is_(True))
    q = q.order_by(CrmWorkspace.is_default.desc(), CrmWorkspace.name)
    rows = (await db.execute(q)).all()
    out = []
    for row in rows:
        o = _out(row.CrmWorkspace)
        o.leadCount = row.lc
        o.dealCount = row.dc
        o.memberCount = row.mc
        o.createdByName = row.creator_name
        out.append(o)
    return out


async def list_crms_brief(
    db: AsyncSession, tenant_id: int
) -> list[schemas.CrmBrief]:
    rows = (
        await db.execute(
            select(CrmWorkspace.id, CrmWorkspace.name, CrmWorkspace.slug, CrmWorkspace.is_default)
            .where(CrmWorkspace.tenant_id == tenant_id, CrmWorkspace.active.is_(True))
            .order_by(CrmWorkspace.is_default.desc(), CrmWorkspace.name)
        )
    ).all()
    return [
        schemas.CrmBrief(id=str(r[0]), name=r[1], slug=r[2], isDefault=r[3])
        for r in rows
    ]


async def get_crm(
    db: AsyncSession, tenant_id: int, crm_id: int
) -> schemas.CrmWorkspaceOut:
    lead_count = (
        select(func.count(Lead.id))
        .where(Lead.tenant_id == tenant_id, Lead.crm_id == crm_id)
        .scalar_subquery()
    )
    deal_count = (
        select(func.count(Deal.id))
        .where(Deal.tenant_id == tenant_id, Deal.crm_id == crm_id)
        .scalar_subquery()
    )
    member_count = (
        select(func.count(CrmMember.id))
        .where(CrmMember.crm_id == crm_id)
        .scalar_subquery()
    )
    row = (
        await db.execute(
            select(
                CrmWorkspace,
                User.name.label("creator_name"),
                lead_count.label("lc"),
                deal_count.label("dc"),
                member_count.label("mc"),
            )
            .outerjoin(User, User.id == CrmWorkspace.created_by)
            .where(
                CrmWorkspace.tenant_id == tenant_id,
                CrmWorkspace.id == crm_id,
            )
        )
    ).first()
    if row is None:
        raise ApiError("not_found", "CRM workspace not found.", 404)
    o = _out(row.CrmWorkspace)
    o.createdByName = row.creator_name
    o.leadCount = row.lc
    o.dealCount = row.dc
    o.memberCount = row.mc
    return o


async def create_crm(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    data: schemas.CrmWorkspaceIn,
) -> schemas.CrmWorkspaceOut:
    slug = _slugify(data.name)
    existing = await db.scalar(
        select(CrmWorkspace.id).where(
            CrmWorkspace.tenant_id == tenant_id, CrmWorkspace.slug == slug
        )
    )
    if existing:
        count = await db.scalar(
            select(func.count(CrmWorkspace.id)).where(CrmWorkspace.tenant_id == tenant_id)
        )
        slug = f"{slug}-{count or 2}"

    stages = data.pipelineStages or DEFAULT_STAGES
    ws = CrmWorkspace(
        tenant_id=tenant_id,
        name=data.name.strip(),
        slug=slug,
        description=(data.description or "").strip(),
        pipeline_stages=stages,
        is_default=False,
        created_by=user_id,
    )
    db.add(ws)
    await db.flush()
    record(
        db, "crm.workspace.created", user_id=user_id, tenant_id=tenant_id,
        details={"crm_id": ws.id, "name": ws.name},
    )
    return _out(ws)


async def update_crm(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    crm_id: int,
    data: schemas.CrmWorkspaceUpdate,
) -> schemas.CrmWorkspaceOut:
    ws = await db.scalar(
        select(CrmWorkspace)
        .where(CrmWorkspace.tenant_id == tenant_id, CrmWorkspace.id == crm_id)
        .with_for_update()
    )
    if ws is None:
        raise ApiError("not_found", "CRM workspace not found.", 404)
    if data.name is not None:
        ws.name = data.name.strip()
    if data.description is not None:
        ws.description = data.description.strip()
    if data.pipelineStages is not None:
        ws.pipeline_stages = data.pipelineStages
    if data.winStage is not None:
        ws.win_stage = data.winStage
    ws.updated_at = now()
    await db.flush()
    record(
        db, "crm.workspace.updated", user_id=user_id, tenant_id=tenant_id,
        details={"crm_id": ws.id},
    )
    return _out(ws)


async def archive_crm(
    db: AsyncSession, tenant_id: int, user_id: int, crm_id: int
) -> schemas.CrmWorkspaceOut:
    ws = await db.scalar(
        select(CrmWorkspace)
        .where(CrmWorkspace.tenant_id == tenant_id, CrmWorkspace.id == crm_id)
        .with_for_update()
    )
    if ws is None:
        raise ApiError("not_found", "CRM workspace not found.", 404)
    if ws.is_default:
        raise ApiError("cannot_archive_default", "The default CRM cannot be archived.", 409)
    ws.active = False
    ws.updated_at = now()
    await db.flush()
    record(
        db, "crm.workspace.archived", user_id=user_id, tenant_id=tenant_id,
        details={"crm_id": ws.id},
    )
    return _out(ws)


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------


async def list_members(
    db: AsyncSession, tenant_id: int, crm_id: int
) -> list[schemas.CrmMemberOut]:
    from janus_api.auth.models import User

    rows = (
        await db.execute(
            select(CrmMember, User.name)
            .join(
                Membership,
                (Membership.id == CrmMember.membership_id)
                & (Membership.tenant_id == CrmMember.tenant_id),
            )
            .join(User, User.id == Membership.user_id)
            .where(CrmMember.tenant_id == tenant_id, CrmMember.crm_id == crm_id)
            .order_by(User.name)
        )
    ).all()
    return [_member_out(m, name) for m, name in rows]


async def add_member(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    crm_id: int,
    data: schemas.CrmMemberIn,
) -> schemas.CrmMemberOut:
    ws = await db.scalar(
        select(CrmWorkspace.id).where(
            CrmWorkspace.tenant_id == tenant_id, CrmWorkspace.id == crm_id
        )
    )
    if ws is None:
        raise ApiError("not_found", "CRM workspace not found.", 404)
    membership_id = int(data.membershipId)
    exists = await db.scalar(
        select(CrmMember.id).where(
            CrmMember.crm_id == crm_id, CrmMember.membership_id == membership_id
        )
    )
    if exists:
        raise ApiError("already_member", "Already a member of this CRM.", 409)
    m = CrmMember(
        tenant_id=tenant_id,
        crm_id=crm_id,
        membership_id=membership_id,
        role=data.role or "member",
    )
    db.add(m)
    await db.flush()
    record(
        db, "crm.member.added", user_id=user_id, tenant_id=tenant_id,
        details={"crm_id": crm_id, "membership_id": membership_id},
    )
    return _member_out(m)


async def remove_member(
    db: AsyncSession, tenant_id: int, user_id: int, crm_id: int, member_id: int
) -> None:
    m = await db.scalar(
        select(CrmMember).where(
            CrmMember.tenant_id == tenant_id,
            CrmMember.crm_id == crm_id,
            CrmMember.id == member_id,
        )
    )
    if m is None:
        raise ApiError("not_found", "CRM member not found.", 404)
    await db.delete(m)
    record(
        db, "crm.member.removed", user_id=user_id, tenant_id=tenant_id,
        details={"crm_id": crm_id, "member_id": member_id},
    )


async def update_member_role(
    db: AsyncSession, tenant_id: int, user_id: int, crm_id: int, member_id: int, role: str,
) -> schemas.CrmMemberOut:
    if role not in ("member", "manager"):
        raise ApiError("invalid_role", "Role must be 'member' or 'manager'.", 422)
    m = await db.scalar(
        select(CrmMember).where(
            CrmMember.tenant_id == tenant_id,
            CrmMember.crm_id == crm_id,
            CrmMember.id == member_id,
        )
    )
    if m is None:
        raise ApiError("not_found", "CRM member not found.", 404)
    m.role = role
    await db.flush()
    record(
        db, "crm.member.role_changed", user_id=user_id, tenant_id=tenant_id,
        details={"crm_id": crm_id, "member_id": member_id, "role": role},
    )
    return _member_out(m)


# ---------------------------------------------------------------------------
# Ensure default CRM for a new tenant
# ---------------------------------------------------------------------------


async def ensure_default_crm(
    db: AsyncSession, tenant_id: int, user_id: int
) -> int:
    existing = await db.scalar(
        select(CrmWorkspace.id).where(
            CrmWorkspace.tenant_id == tenant_id, CrmWorkspace.is_default.is_(True)
        )
    )
    if existing:
        return existing
    ws = CrmWorkspace(
        tenant_id=tenant_id,
        name="Sales",
        slug="sales",
        description="Default sales CRM",
        pipeline_stages=DEFAULT_STAGES,
        is_default=True,
        active=True,
        created_by=user_id,
    )
    db.add(ws)
    await db.flush()
    return ws.id
