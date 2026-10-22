# ruff: noqa: E501

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_, select

from janus_api.auth.service import Actor
from janus_api.business import schemas, service
from janus_api.business.models import AgentDefinition, AutomationExecution, AutomationWorkflow
from janus_api.core.deps import CurrentActor, Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.org.service import membership

router = APIRouter(prefix="/v1", tags=["Business management"])
Owner = Annotated[Actor, Depends(require("workspaces:manage"))]
Reports = Annotated[Actor, Depends(require("reports:read"))]
Intelligence = Annotated[Actor, Depends(require("ai:manage"))]
Agents = Annotated[Actor, Depends(require("agents:manage"))]
Automations = Annotated[Actor, Depends(require("automations:manage"))]


@router.get("/business/setup", response_model=schemas.SetupOut)
async def setup(actor: CurrentActor, db: Db) -> schemas.SetupOut:
    return await service.get_setup(db, actor.session.tenant_id)


@router.patch("/business/setup", response_model=schemas.SetupOut)
async def update_setup(
    data: schemas.SetupUpdate, actor: Owner, db: Db, request: Request
) -> schemas.SetupOut:
    return await service.update_setup(
        db, actor.session.tenant_id, actor.user.id, data, request_ip(request)
    )


@router.get("/workspaces", response_model=list[schemas.WorkspaceOut])
async def workspaces(actor: CurrentActor, db: Db) -> list[schemas.WorkspaceOut]:
    member, _ = await membership(db, actor.user.id, actor.session.tenant_id)
    return await service.list_workspaces(db, actor.session.tenant_id, member.id)


@router.post("/workspaces", response_model=schemas.WorkspaceOut, status_code=201)
async def create_workspace(
    data: schemas.WorkspaceCreate, actor: Owner, db: Db, request: Request
) -> schemas.WorkspaceOut:
    return await service.create_workspace(
        db, actor.session.tenant_id, actor.user.id, data, request_ip(request)
    )


@router.get("/workspaces/{workspace_id}/members", response_model=list[schemas.WorkspaceMemberOut])
async def workspace_members(
    workspace_id: int, actor: CurrentActor, db: Db
) -> list[schemas.WorkspaceMemberOut]:
    return await service.list_workspace_members(db, actor.session.tenant_id, workspace_id)


@router.patch(
    "/workspaces/{workspace_id}/members/{membership_id}", response_model=schemas.WorkspaceMemberOut
)
async def update_workspace_member(
    workspace_id: int,
    membership_id: int,
    data: schemas.WorkspaceMemberUpdate,
    actor: Owner,
    db: Db,
    request: Request,
) -> schemas.WorkspaceMemberOut:
    return await service.update_workspace_member(
        db,
        actor.session.tenant_id,
        workspace_id,
        membership_id,
        data,
        actor.user.id,
        request_ip(request),
    )


@router.get("/business/reports/summary", response_model=schemas.ReportSummary)
async def report_summary(actor: Reports, db: Db) -> schemas.ReportSummary:
    return await service.report_summary(db, actor.session.tenant_id)


@router.post("/business/intelligence/ask", response_model=schemas.IntelligenceAnswer)
async def intelligence(
    data: schemas.IntelligenceAsk, actor: Intelligence, db: Db
) -> schemas.IntelligenceAnswer:
    workspace_id = await service.ensure_workspace_access(
        db, actor.session.tenant_id, actor.user.id, data.workspaceId
    )
    return await service.intelligence_answer(
        db, actor.session.tenant_id, data.question, workspace_id
    )


@router.get("/business/agents", response_model=list[schemas.AgentOut])
async def agents(actor: CurrentActor, db: Db) -> list[schemas.AgentOut]:
    workspace_ids = await service.accessible_workspace_ids(
        db, actor.session.tenant_id, actor.user.id
    )
    return [
        service.agent_out(item)
        for item in (
            await db.scalars(
                select(AgentDefinition)
                .where(AgentDefinition.tenant_id == actor.session.tenant_id)
                .where(or_(AgentDefinition.workspace_id.is_(None), AgentDefinition.workspace_id.in_(workspace_ids)))
                .where(AgentDefinition.status != "archived")
                .order_by(AgentDefinition.id)
            )
        ).all()
    ]


@router.post("/business/agents", response_model=schemas.AgentOut, status_code=201)
async def create_agent(
    data: schemas.AgentCreate, actor: Agents, db: Db, request: Request
) -> schemas.AgentOut:
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, data.workspaceId)
    item = AgentDefinition(
        tenant_id=actor.session.tenant_id,
        workspace_id=data.workspaceId,
        agent_key=data.key,
        name=data.name,
        department=data.department,
        configuration=data.configuration,
    )
    db.add(item)
    await db.flush()
    from janus_api.audit.service import record

    record(
        db,
        "business.agent_created",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"agent_id": item.id},
    )
    return service.agent_out(item)


@router.get("/business/agents/{agent_id}", response_model=schemas.AgentOut)
async def agent_detail(agent_id: int, actor: CurrentActor, db: Db) -> schemas.AgentOut:
    item = await db.scalar(
        select(AgentDefinition).where(
            AgentDefinition.id == agent_id,
            AgentDefinition.tenant_id == actor.session.tenant_id,
            AgentDefinition.status != "archived",
        )
    )
    if item is None:
        from janus_api.core.errors import ApiError

        raise ApiError("not_found", "Agent not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    return service.agent_out(item)


@router.patch("/business/agents/{agent_id}", response_model=schemas.AgentOut)
async def update_agent(
    agent_id: int, data: schemas.AgentUpdate, actor: Agents, db: Db, request: Request
) -> schemas.AgentOut:
    item = await db.scalar(
        select(AgentDefinition)
        .where(
            AgentDefinition.id == agent_id,
            AgentDefinition.tenant_id == actor.session.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        from janus_api.core.errors import ApiError

        raise ApiError("not_found", "Agent not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    for key, value in (
        ("name", data.name),
        ("department", data.department),
        ("status", data.status),
        ("configuration", data.configuration),
    ):
        if value is not None:
            setattr(item, key, value)
    from janus_api.audit.service import record

    record(
        db,
        "business.agent_updated",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"agent_id": agent_id},
    )
    return service.agent_out(item)


@router.delete("/business/agents/{agent_id}", response_model=schemas.AgentOut)
async def archive_agent(
    agent_id: int, actor: Agents, db: Db, request: Request
) -> schemas.AgentOut:
    item = await db.scalar(
        select(AgentDefinition)
        .where(
            AgentDefinition.id == agent_id,
            AgentDefinition.tenant_id == actor.session.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        from janus_api.core.errors import ApiError

        raise ApiError("not_found", "Agent not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    item.status = "archived"
    from janus_api.audit.service import record

    record(
        db,
        "business.agent_archived",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"agent_id": agent_id},
    )
    return service.agent_out(item)


@router.post("/business/agents/{agent_id}/test", response_model=dict, status_code=202)
async def test_agent(
    agent_id: int, actor: Agents, db: Db, request: Request
) -> dict:
    """Run a side-effect-free agent preview against its saved contract."""
    item = await db.scalar(
        select(AgentDefinition).where(
            AgentDefinition.id == agent_id,
            AgentDefinition.tenant_id == actor.session.tenant_id,
            AgentDefinition.status != "archived",
        )
    )
    if item is None:
        raise ApiError("not_found", "Agent not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    from janus_api.audit.service import record

    record(
        db,
        "business.agent_dry_run",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"agent_id": agent_id},
    )
    return {
        "agentId": str(item.id),
        "status": "dry_run",
        "sideEffects": False,
        "readScopes": item.configuration.get("readScopes", item.configuration.get("readPermissions", [])),
        "proposedActions": item.configuration.get("actions", []),
        "message": "Dry run completed. No messages were sent and no business records were changed.",
    }


@router.get("/business/automations", response_model=list[schemas.WorkflowOut])
async def automations(actor: CurrentActor, db: Db) -> list[schemas.WorkflowOut]:
    workspace_ids = await service.accessible_workspace_ids(
        db, actor.session.tenant_id, actor.user.id
    )
    return [
        service.workflow_out(item)
        for item in (
            await db.scalars(
                select(AutomationWorkflow)
                .where(
                    AutomationWorkflow.tenant_id == actor.session.tenant_id,
                    or_(AutomationWorkflow.workspace_id.is_(None), AutomationWorkflow.workspace_id.in_(workspace_ids)),
                    AutomationWorkflow.status != "archived",
                )
                .order_by(AutomationWorkflow.id)
            )
        ).all()
    ]


@router.post("/business/automations", response_model=schemas.WorkflowOut, status_code=201)
async def create_automation(
    data: schemas.WorkflowCreate, actor: Automations, db: Db, request: Request
) -> schemas.WorkflowOut:
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, data.workspaceId)
    item = AutomationWorkflow(
        tenant_id=actor.session.tenant_id,
        workspace_id=data.workspaceId,
        name=data.name,
        description=data.description,
        trigger=data.trigger,
        actions=data.actions,
        requires_approval=data.requiresApproval,
        created_by=actor.user.id,
    )
    db.add(item)
    await db.flush()
    from janus_api.audit.service import record

    record(
        db,
        "business.automation_created",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"workflow_id": item.id},
    )
    return service.workflow_out(item)


@router.get("/business/automations/executions", response_model=list[schemas.ExecutionOut])
async def executions_for_business(actor: CurrentActor, db: Db) -> list[schemas.ExecutionOut]:
    """List only executions belonging to workspaces visible to the caller."""
    workspace_ids = await service.accessible_workspace_ids(db, actor.session.tenant_id, actor.user.id)
    items = (
        await db.scalars(
            select(AutomationExecution)
            .join(AutomationWorkflow, AutomationWorkflow.id == AutomationExecution.workflow_id)
            .where(AutomationExecution.tenant_id == actor.session.tenant_id)
            .where(or_(AutomationWorkflow.workspace_id.is_(None), AutomationWorkflow.workspace_id.in_(workspace_ids)))
            .order_by(AutomationExecution.id.desc())
            .limit(100)
        )
    ).all()
    return [service.execution_out(item) for item in items]


@router.get("/business/automations/{workflow_id}/runs", response_model=list[schemas.ExecutionOut])
async def workflow_runs(workflow_id: int, actor: CurrentActor, db: Db) -> list[schemas.ExecutionOut]:
    workflow = await db.scalar(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.tenant_id == actor.session.tenant_id,
            AutomationWorkflow.status != "archived",
        )
    )
    if workflow is None:
        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, workflow.workspace_id)
    items = (
        await db.scalars(
            select(AutomationExecution)
            .where(
                AutomationExecution.tenant_id == actor.session.tenant_id,
                AutomationExecution.workflow_id == workflow_id,
            )
            .order_by(AutomationExecution.id.desc())
            .limit(100)
        )
    ).all()
    return [service.execution_out(item) for item in items]


@router.get("/business/automations/{workflow_id}/versions", response_model=list[dict])
async def workflow_versions(workflow_id: int, actor: CurrentActor, db: Db) -> list[dict]:
    workflow = await db.scalar(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.tenant_id == actor.session.tenant_id,
            AutomationWorkflow.status != "archived",
        )
    )
    if workflow is None:
        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, workflow.workspace_id)
    return [{"version": 1, "status": workflow.status, "createdAt": workflow.created_at, "changeNote": "Initial workflow version"}]


@router.patch("/business/automations/{workflow_id}/draft", response_model=schemas.WorkflowOut)
async def save_workflow_draft(
    workflow_id: int, data: schemas.WorkflowUpdate, actor: Automations, db: Db, request: Request
) -> schemas.WorkflowOut:
    item = await db.scalar(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.tenant_id == actor.session.tenant_id,
        ).with_for_update()
    )
    if item is None:
        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    for key, value in (("name", data.name), ("description", data.description), ("trigger", data.trigger), ("actions", data.actions), ("requires_approval", data.requiresApproval)):
        if value is not None:
            setattr(item, key, value)
    item.status = "draft"
    from janus_api.audit.service import record
    record(db, "business.automation_draft_saved", tenant_id=actor.session.tenant_id, user_id=actor.user.id, ip=request_ip(request), details={"workflow_id": workflow_id})
    return service.workflow_out(item)


@router.post("/business/automations/{workflow_id}/publish", response_model=schemas.WorkflowOut)
async def publish_workflow(
    workflow_id: int, payload: dict, actor: Automations, db: Db, request: Request
) -> schemas.WorkflowOut:
    item = await db.scalar(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.tenant_id == actor.session.tenant_id,
            AutomationWorkflow.status != "archived",
        ).with_for_update()
    )
    if item is None:
        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    item.status = "active"
    from janus_api.audit.service import record
    record(db, "business.automation_published", tenant_id=actor.session.tenant_id, user_id=actor.user.id, ip=request_ip(request), details={"workflow_id": workflow_id, "change_note": payload.get("changeNote", "")})
    return service.workflow_out(item)


@router.post("/business/automations/{workflow_id}/test", response_model=schemas.ExecutionOut, status_code=202)
async def test_workflow(
    workflow_id: int, payload: dict, actor: Automations, db: Db, request: Request
) -> schemas.ExecutionOut:
    workflow = await db.scalar(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.tenant_id == actor.session.tenant_id,
            AutomationWorkflow.status != "archived",
        )
    )
    if workflow is None:
        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, workflow.workspace_id)
    item = AutomationExecution(tenant_id=actor.session.tenant_id, workflow_id=workflow.id, status="dry_run", event={"trigger": "test", "step_id": payload.get("stepId")}, result={"side_effects": False, "message": "Dry run completed without sending or changing business records."})
    db.add(item)
    await db.flush()
    from janus_api.audit.service import record
    record(db, "business.automation_dry_run", tenant_id=actor.session.tenant_id, user_id=actor.user.id, ip=request_ip(request), details={"workflow_id": workflow_id, "execution_id": item.id})
    return service.execution_out(item)


@router.post("/business/automations/{workflow_id}/on", response_model=schemas.WorkflowOut)
@router.post("/business/automations/{workflow_id}/off", response_model=schemas.WorkflowOut)
async def set_workflow_status(workflow_id: int, actor: Automations, db: Db, request: Request) -> schemas.WorkflowOut:
    item = await db.scalar(select(AutomationWorkflow).where(AutomationWorkflow.id == workflow_id, AutomationWorkflow.tenant_id == actor.session.tenant_id).with_for_update())
    if item is None:
        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    item.status = "active" if request.url.path.endswith("/on") else "paused"
    return service.workflow_out(item)


@router.get("/business/automations/{workflow_id}", response_model=schemas.WorkflowOut)
async def automation_detail(workflow_id: int, actor: CurrentActor, db: Db) -> schemas.WorkflowOut:
    item = await db.scalar(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.tenant_id == actor.session.tenant_id,
            AutomationWorkflow.status != "archived",
        )
    )
    if item is None:
        from janus_api.core.errors import ApiError

        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    return service.workflow_out(item)


@router.get("/business/automations/executions", response_model=list[schemas.ExecutionOut])
async def executions(actor: CurrentActor, db: Db) -> list[schemas.ExecutionOut]:
    workspace_ids = await service.accessible_workspace_ids(
        db, actor.session.tenant_id, actor.user.id
    )
    items = (
        await db.scalars(
            select(AutomationExecution)
            .join(AutomationWorkflow, AutomationWorkflow.id == AutomationExecution.workflow_id)
            .where(AutomationExecution.tenant_id == actor.session.tenant_id)
            .where(or_(AutomationWorkflow.workspace_id.is_(None), AutomationWorkflow.workspace_id.in_(workspace_ids)))
            .order_by(AutomationExecution.id.desc())
            .limit(100)
        )
    ).all()
    return [service.execution_out(item) for item in items]


@router.post(
    "/business/automations/{workflow_id}/run", response_model=schemas.ExecutionOut, status_code=202
)
async def run_automation(
    workflow_id: int, actor: Automations, db: Db, request: Request
) -> schemas.ExecutionOut:
    workflow = await db.scalar(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.tenant_id == actor.session.tenant_id,
        )
    )
    if workflow is None:
        from janus_api.core.errors import ApiError

        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, workflow.workspace_id)
    item = AutomationExecution(
        tenant_id=actor.session.tenant_id,
        workflow_id=workflow.id,
        status="pending_approval" if workflow.requires_approval else "queued",
        event={"trigger": "manual", "requested_by": actor.user.id},
        result={},
    )
    db.add(item)
    await db.flush()
    from janus_api.audit.service import record

    record(
        db,
        "business.automation_run_requested",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"workflow_id": workflow.id, "execution_id": item.id},
    )
    return service.execution_out(item)


@router.post(
    "/business/automations/executions/{execution_id}/approve", response_model=schemas.ExecutionOut
)
async def approve_execution(
    execution_id: int,
    actor: Annotated[Actor, Depends(require("approvals:manage"))],
    db: Db,
    request: Request,
) -> schemas.ExecutionOut:
    item = await db.scalar(
        select(AutomationExecution)
        .where(
            AutomationExecution.id == execution_id,
            AutomationExecution.tenant_id == actor.session.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        from janus_api.core.errors import ApiError

        raise ApiError("not_found", "Execution not found.", 404)
    workflow = await db.scalar(select(AutomationWorkflow).where(AutomationWorkflow.id == item.workflow_id))
    if workflow is None:
        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, workflow.workspace_id)
    item.status = "approved"
    item.approved_by = actor.user.id
    from janus_api.audit.service import record

    record(
        db,
        "business.automation_approved",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"execution_id": item.id},
    )
    return service.execution_out(item)


@router.patch("/business/automations/{workflow_id}", response_model=schemas.WorkflowOut)
async def update_automation(
    workflow_id: int, data: schemas.WorkflowUpdate, actor: Automations, db: Db, request: Request
) -> schemas.WorkflowOut:
    item = await db.scalar(
        select(AutomationWorkflow)
        .where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.tenant_id == actor.session.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        from janus_api.core.errors import ApiError

        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    for key, value in (
        ("name", data.name),
        ("description", data.description),
        ("status", data.status),
        ("trigger", data.trigger),
        ("actions", data.actions),
        ("requires_approval", data.requiresApproval),
    ):
        if value is not None:
            setattr(item, key, value)
    from janus_api.audit.service import record

    record(
        db,
        "business.automation_updated",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"workflow_id": item.id},
    )
    return service.workflow_out(item)


@router.delete("/business/automations/{workflow_id}", response_model=schemas.WorkflowOut)
async def archive_automation(
    workflow_id: int, actor: Automations, db: Db, request: Request
) -> schemas.WorkflowOut:
    item = await db.scalar(
        select(AutomationWorkflow)
        .where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.tenant_id == actor.session.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        from janus_api.core.errors import ApiError

        raise ApiError("not_found", "Automation not found.", 404)
    await service.ensure_workspace_access(db, actor.session.tenant_id, actor.user.id, item.workspace_id)
    item.status = "archived"
    from janus_api.audit.service import record

    record(
        db,
        "business.automation_archived",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"workflow_id": workflow_id},
    )
    return service.workflow_out(item)
