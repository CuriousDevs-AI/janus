"""What Projects tells other modules about one company: how delivery stands, and the project
changes waiting for a decision.

Other modules read Projects through these functions, never its tables. Each runs under the
company's own context (the caller sets it), so row-level security applies.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.projects.effort_models import ProjectChange
from janus_api.projects.models import Project
from janus_api.projects.planning_models import ProjectMilestone, ProjectTask


@dataclass(frozen=True)
class Delivery:
    active_projects: int
    late_projects: int
    overdue_milestones: int
    overdue_tasks: int
    awaiting_acceptance: int
    awaiting_acceptance_value: Decimal


async def delivery(db: AsyncSession, tenant_id: int, today: date) -> Delivery:
    """Late projects, milestones and tasks past due, and work done but not yet accepted."""
    active = await db.scalar(
        select(func.count(Project.id)).where(
            Project.tenant_id == tenant_id, Project.status == "active"
        )
    )
    late = await db.scalar(
        select(func.count(Project.id)).where(
            Project.tenant_id == tenant_id,
            Project.status.in_(("active", "on hold")),
            Project.end_on < today,
        )
    )
    overdue_milestones = await db.scalar(
        select(func.count(ProjectMilestone.id)).where(
            ProjectMilestone.tenant_id == tenant_id,
            ProjectMilestone.status == "planned",
            ProjectMilestone.due_on < today,
        )
    )
    awaiting = (
        await db.execute(
            select(
                func.count(ProjectMilestone.id), func.coalesce(func.sum(ProjectMilestone.amount), 0)
            ).where(ProjectMilestone.tenant_id == tenant_id, ProjectMilestone.status == "done")
        )
    ).one()
    overdue_tasks = await db.scalar(
        select(func.count(ProjectTask.id)).where(
            ProjectTask.tenant_id == tenant_id,
            ProjectTask.status != "done",
            ProjectTask.due_on < today,
        )
    )
    return Delivery(
        active_projects=int(active or 0),
        late_projects=int(late or 0),
        overdue_milestones=int(overdue_milestones or 0),
        overdue_tasks=int(overdue_tasks or 0),
        awaiting_acceptance=int(awaiting[0]),
        awaiting_acceptance_value=Decimal(awaiting[1]),
    )


async def pending_changes(db: AsyncSession, tenant_id: int) -> int:
    """Project changes waiting for a decision."""
    count = await db.scalar(
        select(func.count(ProjectChange.id)).where(
            ProjectChange.tenant_id == tenant_id, ProjectChange.status == "pending"
        )
    )
    return int(count or 0)
