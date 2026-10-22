from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth.models import User
from janus_api.business import schemas
from janus_api.business.models import (
    AgentDefinition,
    AutomationExecution,
    AutomationWorkflow,
    BusinessWorkspace,
    WorkspaceMember,
)
from janus_api.core.errors import ApiError
from janus_api.crm.models import Deal, Lead
from janus_api.org.models import Membership, Tenant

WORKSPACE_NAMES = {
    "crm_sales": "CRM & Sales",
    "hr_people": "HR & People",
    "finance_accounting": "Finance & Accounting",
    "projects_delivery": "Projects & Delivery",
    "customer_support": "Customer Support & Success",
    "operations_inventory": "Operations & Inventory",
    "it_infrastructure": "IT & Infrastructure",
}


async def ensure_crm_workspace(db: AsyncSession, tenant_id: int, user_id: int) -> None:
    exists = await db.scalar(
        select(BusinessWorkspace.id).where(
            BusinessWorkspace.tenant_id == tenant_id,
            BusinessWorkspace.workspace_type == "crm_sales",
        )
    )
    if exists:
        return
    item = BusinessWorkspace(
        tenant_id=tenant_id,
        workspace_type="crm_sales",
        name=WORKSPACE_NAMES["crm_sales"],
        description="Customer relationships, leads and sales pipeline.",
        created_by=user_id,
    )
    db.add(item)
    await db.flush()
    membership_id = await db.scalar(
        select(Membership.id).where(
            Membership.tenant_id == tenant_id, Membership.user_id == user_id
        )
    )
    if membership_id:
        db.add(
            WorkspaceMember(
                tenant_id=tenant_id,
                workspace_id=item.id,
                membership_id=membership_id,
                access_level="owner",
                permissions=["read", "write", "manage"],
            )
        )


def workspace_out(item: BusinessWorkspace, access: str = "member") -> schemas.WorkspaceOut:
    return schemas.WorkspaceOut(
        id=str(item.id),
        type=item.workspace_type,
        name=item.name,
        description=item.description,
        status=item.status,
        accessLevel=access,
        createdAt=item.created_at,
    )


async def get_setup(db: AsyncSession, tenant_id: int) -> schemas.SetupOut:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise ApiError("not_found", "Business not found.", 404)
    completed = list((tenant.business_hours or {}).get("setup_steps", []))
    steps = ["business_details", "workspaces", "members", "data_connections"]
    return schemas.SetupOut(
        businessName=tenant.name,
        industry=tenant.industry,
        companySize=tenant.company_size,
        timezone=tenant.timezone,
        setupCompleted=len(completed) == len(steps),
        completedSteps=completed,
        nextStep=next((step for step in steps if step not in completed), None),
    )


async def update_setup(
    db: AsyncSession, tenant_id: int, user_id: int, data: schemas.SetupUpdate, ip: str
) -> schemas.SetupOut:
    tenant = await db.get(Tenant, tenant_id, with_for_update=True)
    if tenant is None:
        raise ApiError("not_found", "Business not found.", 404)
    for key, value in (
        ("name", data.businessName),
        ("industry", data.industry),
        ("company_size", data.companySize),
        ("timezone", data.timezone),
        ("default_channel", data.defaultChannel),
    ):
        if value is not None:
            setattr(tenant, key, value)
    hours = dict(tenant.business_hours or {})
    if data.businessHoursStart is not None:
        hours["start"] = data.businessHoursStart
    if data.businessHoursEnd is not None:
        hours["end"] = data.businessHoursEnd
    if data.businessHoursStart is not None or data.businessHoursEnd is not None:
        tenant.business_hours = hours
    if data.completedSteps is not None:
        tenant.business_hours = {
            **(tenant.business_hours or {}),
            "setup_steps": data.completedSteps,
        }
    record(db, "business.setup_updated", tenant_id=tenant_id, user_id=user_id, ip=ip)
    return await get_setup(db, tenant_id)


async def list_workspaces(
    db: AsyncSession, tenant_id: int, membership_id: int
) -> list[schemas.WorkspaceOut]:
    rows = (
        await db.execute(
            select(BusinessWorkspace, WorkspaceMember.access_level)
            .outerjoin(
                WorkspaceMember,
                (WorkspaceMember.workspace_id == BusinessWorkspace.id)
                & (WorkspaceMember.membership_id == membership_id),
            )
            .where(BusinessWorkspace.tenant_id == tenant_id, BusinessWorkspace.status == "active")
            .order_by(BusinessWorkspace.id)
        )
    ).all()
    return [workspace_out(row[0], row[1] or "member") for row in rows]


async def create_workspace(
    db: AsyncSession, tenant_id: int, user_id: int, data: schemas.WorkspaceCreate, ip: str
) -> schemas.WorkspaceOut:
    if await db.scalar(
        select(BusinessWorkspace.id).where(
            BusinessWorkspace.tenant_id == tenant_id, BusinessWorkspace.workspace_type == data.type
        )
    ):
        raise ApiError("workspace_exists", "This workspace already exists for the business.", 409)
    item = BusinessWorkspace(
        tenant_id=tenant_id,
        workspace_type=data.type,
        name=data.name or WORKSPACE_NAMES[data.type],
        description=data.description,
        created_by=user_id,
    )
    db.add(item)
    await db.flush()
    membership_id = await db.scalar(
        select(Membership.id).where(
            Membership.tenant_id == tenant_id, Membership.user_id == user_id
        )
    )
    if membership_id:
        db.add(
            WorkspaceMember(
                tenant_id=tenant_id,
                workspace_id=item.id,
                membership_id=membership_id,
                access_level="owner",
                permissions=["read", "write", "manage"],
            )
        )
    record(
        db,
        "business.workspace_created",
        tenant_id=tenant_id,
        user_id=user_id,
        ip=ip,
        details={"workspace_id": item.id, "type": data.type},
    )
    return workspace_out(item, "owner")


async def list_workspace_members(
    db: AsyncSession, tenant_id: int, workspace_id: int
) -> list[schemas.WorkspaceMemberOut]:
    rows = (
        await db.execute(
            select(WorkspaceMember, Membership, User)
            .join(Membership, Membership.id == WorkspaceMember.membership_id)
            .join(User, User.id == Membership.user_id)
            .where(
                WorkspaceMember.tenant_id == tenant_id,
                WorkspaceMember.workspace_id == workspace_id,
                Membership.status == "active",
            )
            .order_by(WorkspaceMember.id)
        )
    ).all()
    return [
        schemas.WorkspaceMemberOut(
            membershipId=str(member.id),
            userId=str(user.id),
            name=user.name,
            email=user.email,
            accessLevel=member.access_level,
            permissions=member.permissions or [],
        )
        for member, _, user in rows
    ]


async def accessible_workspace_ids(
    db: AsyncSession, tenant_id: int, user_id: int
) -> list[int]:
    """Return active department workspaces this user is explicitly assigned to."""
    return list(
        (
            await db.scalars(
                select(WorkspaceMember.workspace_id)
                .join(Membership, Membership.id == WorkspaceMember.membership_id)
                .where(
                    WorkspaceMember.tenant_id == tenant_id,
                    Membership.tenant_id == tenant_id,
                    Membership.user_id == user_id,
                    Membership.status == "active",
                )
            )
        ).all()
    )


async def ensure_workspace_access(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    workspace_ref: str | int | None,
) -> int | None:
    """Resolve a UI workspace id/type and require an active assignment."""
    if workspace_ref is None or str(workspace_ref) in {"", "business"}:
        return None
    raw = str(workspace_ref)
    workspace = await db.scalar(
        select(BusinessWorkspace).where(
            BusinessWorkspace.tenant_id == tenant_id,
            BusinessWorkspace.status == "active",
            or_(
                BusinessWorkspace.workspace_type == raw.replace("-", "_"),
                BusinessWorkspace.id == int(raw) if raw.isdigit() else False,
            ),
        )
    )
    if workspace is None:
        raise ApiError("not_found", "Workspace not found.", 404)
    assigned = await db.scalar(
        select(WorkspaceMember.id)
        .join(Membership, Membership.id == WorkspaceMember.membership_id)
        .where(
            WorkspaceMember.tenant_id == tenant_id,
            WorkspaceMember.workspace_id == workspace.id,
            Membership.tenant_id == tenant_id,
            Membership.user_id == user_id,
            Membership.status == "active",
        )
    )
    if assigned is None:
        raise ApiError("forbidden", "You do not have access to this workspace.", 403)
    return workspace.id


async def update_workspace_member(
    db: AsyncSession,
    tenant_id: int,
    workspace_id: int,
    membership_id: int,
    data: schemas.WorkspaceMemberUpdate,
    user_id: int,
    ip: str,
) -> schemas.WorkspaceMemberOut:
    row = (
        await db.execute(
            select(WorkspaceMember, Membership, User)
            .join(Membership, Membership.id == WorkspaceMember.membership_id)
            .join(User, User.id == Membership.user_id)
            .where(
                WorkspaceMember.tenant_id == tenant_id,
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.membership_id == membership_id,
            )
            .with_for_update()
        )
    ).first()
    if row is None:
        raise ApiError("not_found", "Workspace member not found.", 404)
    member, membership_record, user = row
    member.access_level = data.accessLevel
    member.permissions = data.permissions
    record(
        db,
        "business.workspace_member_updated",
        tenant_id=tenant_id,
        user_id=user_id,
        ip=ip,
        details={"workspace_id": workspace_id, "membership_id": membership_id},
    )
    return schemas.WorkspaceMemberOut(
        membershipId=str(member.id),
        userId=str(user.id),
        name=user.name,
        email=user.email,
        accessLevel=member.access_level,
        permissions=member.permissions or [],
    )


def agent_out(item: AgentDefinition) -> schemas.AgentOut:
    return schemas.AgentOut(
        id=str(item.id),
        key=item.agent_key,
        name=item.name,
        department=item.department,
        status=item.status,
        workspaceId=str(item.workspace_id) if item.workspace_id else None,
        configuration=item.configuration,
    )


def workflow_out(item: AutomationWorkflow) -> schemas.WorkflowOut:
    return schemas.WorkflowOut(
        id=str(item.id),
        name=item.name,
        description=item.description,
        status=item.status,
        trigger=item.trigger,
        actions=item.actions,
        requiresApproval=item.requires_approval,
        workspaceId=str(item.workspace_id) if item.workspace_id else None,
    )


def execution_out(item: AutomationExecution) -> schemas.ExecutionOut:
    return schemas.ExecutionOut(
        id=str(item.id),
        workflowId=str(item.workflow_id),
        status=item.status,
        event=item.event,
        result=item.result,
        approvedBy=str(item.approved_by) if item.approved_by else None,
        createdAt=item.created_at,
        completedAt=item.completed_at,
    )


async def report_summary(
    db: AsyncSession, tenant_id: int, workspace_id: int | None = None
) -> schemas.ReportSummary:
    if workspace_id is not None:
        workspace = await db.scalar(
            select(BusinessWorkspace).where(
                BusinessWorkspace.id == workspace_id,
                BusinessWorkspace.tenant_id == tenant_id,
                BusinessWorkspace.status == "active",
            )
        )
        if workspace is None or workspace.workspace_type != "crm_sales":
            return schemas.ReportSummary(
                leads=0,
                openDeals=0,
                wonDeals=0,
                pipelineValue="0",
                dataSources=[],
                unavailable=["workspace records are not connected"],
            )
    leads = int(
        await db.scalar(select(func.count(Lead.id)).where(Lead.tenant_id == tenant_id)) or 0
    )
    open_deals = int(
        await db.scalar(
            select(func.count(Deal.id)).where(
                Deal.tenant_id == tenant_id, Deal.stage.not_in(("won", "lost"))
            )
        )
        or 0
    )
    won = int(
        await db.scalar(
            select(func.count(Deal.id)).where(Deal.tenant_id == tenant_id, Deal.stage == "won")
        )
        or 0
    )
    pipeline = await db.scalar(
        select(func.coalesce(func.sum(Deal.amount), 0)).where(
            Deal.tenant_id == tenant_id, Deal.stage.not_in(("won", "lost"))
        )
    )
    return schemas.ReportSummary(
        leads=leads,
        openDeals=open_deals,
        wonDeals=won,
        pipelineValue=str(Decimal(pipeline or 0)),
        dataSources=["CRM leads", "CRM deals"],
        unavailable=["expenses", "cash flow", "department metrics"],
    )


async def intelligence_answer(
    db: AsyncSession, tenant_id: int, question: str, workspace_id: int | None
) -> schemas.IntelligenceAnswer:
    summary = await report_summary(db, tenant_id, workspace_id)
    scope = f" for workspace {workspace_id}" if workspace_id else ""
    answer = (
        f"For the connected CRM{scope}, Janus found {summary.leads} leads, "
        f"{summary.openDeals} open deals and {summary.wonDeals} won deals. "
        f"The current open pipeline is {summary.pipelineValue}. "
        "This answer is grounded in stored CRM records; no recommendation or external "
        "action was executed."
    )
    return schemas.IntelligenceAnswer(
        answer=answer,
        sources=summary.dataSources,
        unavailable=summary.unavailable,
    )
