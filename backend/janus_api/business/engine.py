"""The workflow runner: carries out a workflow's steps, one run at a time, in the worker.

A run is an `AutomationExecution`. It waits as `pending_approval` until someone approves it, or as
`queued` when the workflow needs no approval. The worker claims one approved or queued run, then
carries out its steps in order, inside one transaction, and records each step's outcome on the run.

Only the steps in `SUPPORTED` are carried out. A run whose workflow has any other step is refused
before anything happens, so a workflow never half-runs because a later step was only a plan.

Steps act as a person, never as Janus itself: the person who approved the run, or else the person
who started it (for a run started by an event, the person who made the workflow). Their current
role decides what the step may do, exactly as it would if they did it on the screen.
"""

import json
import logging
import re
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from janus_api.audit.service import record
from janus_api.business.models import AutomationExecution, AutomationWorkflow
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context

APPROVAL_ACTIONS = frozenset({"approval", "request_approval", "require_approval"})
# What Janus carries out, by step action, with the modules each is offered under.
SUPPORTED: dict[str, frozenset[str]] = {
    "approval": frozenset({"business", "logic", ""}),
    "send_notification": frozenset({"communication", "team_chat", ""}),
    "create_task": frozenset({"projects_delivery"}),
}
# Why a step Janus does not carry out is refused, when there is more to say than "not yet".
UNSUPPORTED_REASONS = {
    ("create_task", "crm_sales"): (
        "CRM follow-up tasks are kept on the CRM screen, so a workflow cannot create them yet. "
        "Use a Projects & Delivery task or a Team Chat message instead."
    ),
}
# The fields of the record a run is about, by record: {"lead": {"name": ...}}.
Values = dict[str, dict[str, Any]]
TOKEN = re.compile(r"\{\{\s*([a-z_]+)\.([a-z_]+)\s*\}\}")


class StepError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code, self.message = code, message


def step_action(step: object) -> tuple[str, str]:
    """A saved step's action and module: the editor saves `action`, templates save `type`."""
    raw = step if isinstance(step, dict) else {}
    action = raw.get("action") or raw.get("type") or ""
    action = "approval" if action in APPROVAL_ACTIONS else str(action)
    return action, str(raw.get("module") or "")


def is_supported(action: str, module: str) -> bool:
    return module in SUPPORTED.get(action, frozenset())


def refusals(actions: list[Any]) -> list[dict[str, Any]]:
    """Every enabled step Janus would not carry out, with the reason shown to the person."""
    refused = []
    for index, step in enumerate(actions):
        if isinstance(step, dict) and step.get("disabled") is True:
            continue
        action, module = step_action(step)
        if not is_supported(action, module):
            refused.append(
                {
                    "index": index,
                    "id": str(step.get("id", index)) if isinstance(step, dict) else str(index),
                    "action": action,
                    "module": module,
                    "reason": UNSUPPORTED_REASONS.get(
                        (action, module),
                        f"Janus does not carry out “{action.replace('_', ' ') or 'unnamed'}” "
                        "steps yet. Remove or disable this step to run the workflow.",
                    ),
                }
            )
    return refused


def refused_result(actions: list[Any]) -> dict[str, Any]:
    refused = refusals(actions)
    return {
        "steps": [
            {
                "index": item["index"],
                "id": item["id"],
                "action": item["action"],
                "module": item["module"],
                "status": "refused",
                "error": {"code": "unsupported_step", "message": item["reason"]},
            }
            for item in refused
        ],
        "error": {
            "code": "unsupported_steps",
            "message": "Nothing was run: this workflow has steps Janus does not carry out yet.",
        },
    }


async def _context(db: AsyncSession, run: AutomationExecution) -> Values:
    """The record a run is about, as the fields a step's text may use: {{lead.name}}."""
    from janus_api.crm.models import Contact, Lead
    from janus_api.support.models import SupportTicket

    values: Values = {}
    lead_id = run.event.get("lead_id")
    if isinstance(lead_id, int):
        row = (
            await db.execute(
                select(Lead, Contact)
                .join(Contact, Contact.id == Lead.contact_id)
                .where(Lead.tenant_id == run.tenant_id, Lead.id == lead_id)
            )
        ).first()
        if row is None:
            raise StepError("record_missing", "The lead this run is about no longer exists.")
        lead, contact = row
        values["lead"] = {
            "id": lead.id,
            "name": contact.name or "New lead",
            "company": contact.company,
            "requirement": lead.requirement,
            "source": lead.source,
            "stage": lead.stage,
        }
    ticket_id = run.event.get("ticket_id")
    if isinstance(ticket_id, int):
        ticket = await db.scalar(
            select(SupportTicket).where(
                SupportTicket.tenant_id == run.tenant_id, SupportTicket.id == ticket_id
            )
        )
        if ticket is None:
            raise StepError("record_missing", "The ticket this run is about no longer exists.")
        values["ticket"] = {
            "id": ticket.id,
            "number": ticket.number,
            "subject": ticket.subject,
            "priority": ticket.priority,
            "status": ticket.status,
        }
    return values


def _fill(template: object, values: Values, field: str) -> str:
    if not isinstance(template, str) or not template.strip():
        raise StepError("missing_config", f"Set “{field}” in this step's configuration.")

    def replace(match: re.Match[str]) -> str:
        group, name = match.group(1), match.group(2)
        if group not in values or name not in values[group]:
            raise StepError(
                "unknown_field", f"“{match.group(0)}” is not available to this run's record."
            )
        return str(values[group][name])

    return TOKEN.sub(replace, template).strip()


class Runner:
    """The person a run acts as, with their current role's permissions."""

    def __init__(self, user_id: int, permissions: set[str]) -> None:
        self.user_id, self.permissions = user_id, permissions


async def _runner(
    db: AsyncSession, run: AutomationExecution, workflow: AutomationWorkflow
) -> Runner:
    from janus_api.business.service import ensure_workspace_access
    from janus_api.org.service import MEMBER_PERMISSIONS, membership

    user_id = run.approved_by or run.event.get("requested_by") or workflow.created_by
    try:
        _, role = await membership(db, int(user_id), run.tenant_id)
        await ensure_workspace_access(db, run.tenant_id, int(user_id), workflow.workspace_id)
    except ApiError as error:
        raise StepError(
            "runner_not_allowed",
            "The person this run acts for is no longer an active member with access to it.",
        ) from error
    return Runner(int(user_id), set(role.permissions) | MEMBER_PERMISSIONS)


async def _send_notification(
    db: AsyncSession,
    run: AutomationExecution,
    index: int,
    config: dict[str, Any],
    values: Values,
    who: Runner,
) -> dict[str, Any]:
    """Post in a Team Chat channel the person has joined, as that person."""
    from janus_api.team.models import TeamMessage, TeamSpace
    from janus_api.team.service import ANNOUNCER, _member

    name = str(config.get("channel") or "").strip().lstrip("#").lower()
    if not name:
        raise StepError("missing_config", "Set “channel” to the Team Chat channel to post in.")
    body = _fill(config.get("message"), values, "message")
    if len(body) > 4000:
        raise StepError("message_too_long", "The message is longer than 4,000 characters.")
    space = await db.scalar(
        select(TeamSpace).where(
            TeamSpace.tenant_id == run.tenant_id,
            TeamSpace.kind == "channel",
            TeamSpace.name == name,
        )
    )
    if space is None:
        raise StepError("channel_not_found", f"There is no Team Chat channel called #{name}.")
    if space.announcements and ANNOUNCER not in who.permissions:
        raise StepError(
            "announcers_only", "Only people who make announcements can post in this channel."
        )
    if await _member(db, space.id, who.user_id) is None:
        raise StepError("not_joined", f"The person this run acts for has not joined #{name}.")
    key = f"workflow-run-{run.id}-{index}"
    message = await db.scalar(
        select(TeamMessage).where(
            TeamMessage.tenant_id == run.tenant_id,
            TeamMessage.author_id == who.user_id,
            TeamMessage.idempotency_key == key,
        )
    )
    if message is None:
        message = TeamMessage(
            tenant_id=run.tenant_id,
            space_id=space.id,
            author_id=who.user_id,
            body=body,
            kind="announcement" if space.announcements else "text",
            idempotency_key=key,
        )
        db.add(message)
        await db.flush()
    return {"detail": f"Posted in #{name}", "output": {"messageId": str(message.id)}}


async def _create_task(
    db: AsyncSession,
    run: AutomationExecution,
    index: int,
    config: dict[str, Any],
    values: Values,
    who: Runner,
) -> dict[str, Any]:
    """Add a task to a project, as the person, who must be able to manage projects."""
    from janus_api.projects.planning import _active_member, _project
    from janus_api.projects.planning_models import ProjectTask

    if "projects:manage" not in who.permissions:
        raise StepError("forbidden", "The person this run acts for cannot manage projects.")
    project_key = str(config.get("project") or "").strip()
    if not project_key:
        raise StepError("missing_config", "Set “project” to the project's key.")
    title = _fill(config.get("title"), values, "title")[:200]
    days = config.get("dueInDays", 1)
    if not isinstance(days, int) or isinstance(days, bool) or not 0 <= days <= 365:
        raise StepError("invalid_config", "“dueInDays” must be a whole number from 0 to 365.")
    try:
        project = await _project(db, run.tenant_id, project_key)
        assignee = config.get("assignee")
        assignee_id = await _active_member(
            db, run.tenant_id, str(assignee) if assignee is not None else None
        )
    except ApiError as error:
        raise StepError(error.code, error.message) from error
    key = f"workflow-run-{run.id}-{index}"
    task = await db.scalar(
        select(ProjectTask).where(
            ProjectTask.tenant_id == run.tenant_id, ProjectTask.external_key == key
        )
    )
    if task is None:
        task = ProjectTask(
            tenant_id=run.tenant_id,
            project_id=project.id,
            external_key=key,
            title=title,
            assignee_user_id=assignee_id,
            due_on=date.today() + timedelta(days=days),
            status="todo",
        )
        db.add(task)
        await db.flush()
        record(
            db,
            "project.task_created",
            user_id=who.user_id,
            tenant_id=run.tenant_id,
            details={"project_key": project_key, "task": key, "execution_id": run.id},
        )
    return {
        "detail": f"Added “{task.title}” to {project_key}, due {task.due_on.isoformat()}",
        "output": {"project": project_key, "taskKey": key},
    }


HANDLERS = {"send_notification": _send_notification, "create_task": _create_task}


async def carry_out(db: AsyncSession, run: AutomationExecution) -> None:
    """Carry out a claimed run from its next step until it ends or waits for an approval."""
    workflow = await db.get(AutomationWorkflow, run.workflow_id)
    result: dict[str, Any] = dict(run.result or {})
    steps: list[dict[str, Any]] = list(result.get("steps", []))
    result.setdefault("started_at", now().isoformat())

    def finish(status: str, error: dict[str, str] | None = None) -> None:
        if error:
            result["error"] = error
        result["steps"] = steps
        run.result, run.status, run.completed_at = result, status, now()

    if workflow is None or workflow.status == "archived":
        finish("failed", {"code": "workflow_gone", "message": "This workflow was archived."})
        return
    actions = list(workflow.actions or [])
    if refusals(actions):
        refused = refused_result(actions)
        steps.extend(refused["steps"])
        finish("refused", refused["error"])
        return
    # A fresh approval covers the approval step it was waiting at (or a leading one).
    approved_now = run.status == "approved"
    try:
        who = await _runner(db, run, workflow)
        values = await _context(db, run)
    except StepError as error:
        finish("failed", {"code": error.code, "message": error.message})
        return
    result["acted_as"] = str(who.user_id)
    # Audit rows, and anything else a step writes, are written as that person.
    await set_context(db, tenant_id=run.tenant_id, user_id=who.user_id)
    values["workflow"] = {"name": workflow.name}
    for index in range(int(result.get("next_index", 0)), len(actions)):
        step = actions[index] if isinstance(actions[index], dict) else {}
        action, module = step_action(step)
        entry: dict[str, Any] = {
            "index": index,
            "id": str(step.get("id", index)),
            "action": action,
            "module": module,
            "title": str(step.get("title") or action.replace("_", " ")),
        }
        result["next_index"] = index + 1
        if step.get("disabled") is True:
            steps.append({**entry, "status": "skipped", "detail": "Step is disabled"})
            continue
        if action == "approval":
            if not approved_now:
                result["next_index"] = index
                result["waiting_at"] = entry["id"]
                result["steps"] = steps
                run.result, run.status = result, "pending_approval"
                return
            approved_now = False
            steps.append(
                {**entry, "status": "approved", "detail": f"Approved by user {run.approved_by}"}
            )
            continue
        raw_config = step.get("config")
        config: dict[str, Any] = raw_config if isinstance(raw_config, dict) else {}
        try:
            async with db.begin_nested():
                outcome = await HANDLERS[action](db, run, index, config, values, who)
        except StepError as error:
            steps.append(
                {
                    **entry,
                    "status": "failed",
                    "error": {"code": error.code, "message": error.message},
                }
            )
            finish("failed", {"code": error.code, "message": f"Step {index + 1} failed."})
            return
        except Exception as error:  # A step must never leave its run claimed forever.
            logging.getLogger("janus").error(
                json.dumps(
                    {
                        "event": "workflow_step_crashed",
                        "execution_id": run.id,
                        "exception_type": type(error).__name__,
                    }
                )
            )
            steps.append(
                {
                    **entry,
                    "status": "failed",
                    "error": {
                        "code": "step_crashed",
                        "message": "This step hit an internal error.",
                    },
                }
            )
            finish("failed", {"code": "step_crashed", "message": f"Step {index + 1} failed."})
            return
        steps.append({**entry, "status": "done", **outcome, "finishedAt": now().isoformat()})
    result.pop("waiting_at", None)
    finish("completed")


async def run_once(factory: async_sessionmaker[AsyncSession]) -> bool:
    async with factory() as db, db.begin():
        claim = (
            await db.execute(text("SELECT * FROM public.claim_automation_execution()"))
        ).first()
        if claim is None:
            return False
        await set_context(db, tenant_id=claim.tenant_id)
        run = await db.get(AutomationExecution, claim.id)
        if run is None:
            raise RuntimeError("Claimed workflow run is missing")
        await carry_out(db, run)
        acted_as = (run.result or {}).get("acted_as")
        record(
            db,
            "business.automation_run_finished",
            user_id=int(acted_as) if acted_as else None,
            tenant_id=run.tenant_id,
            details={"execution_id": run.id, "status": run.status},
        )
        return True
