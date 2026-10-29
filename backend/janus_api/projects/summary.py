"""The closure summary for a project, computed on the server from its typed records."""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.projects.effort_models import ProjectChange, ProjectTimesheet
from janus_api.projects.models import Project
from janus_api.projects.planning_models import ProjectMilestone


async def closure_summary(db: AsyncSession, tenant_id: int, project_key: str) -> dict | None:
    """Closing figures from the typed records. None if the project is only on the screens."""
    project = await db.scalar(
        select(Project).where(Project.tenant_id == tenant_id, Project.external_key == project_key)
    )
    if project is None:
        return None
    milestones = (
        await db.execute(
            select(
                func.count(ProjectMilestone.id), func.coalesce(func.sum(ProjectMilestone.amount), 0)
            ).where(
                ProjectMilestone.project_id == project.id,
                ProjectMilestone.status == "accepted",
            )
        )
    ).one()
    total_milestones = await db.scalar(
        select(func.count(ProjectMilestone.id)).where(ProjectMilestone.project_id == project.id)
    )
    hours = await db.scalar(
        select(func.coalesce(func.sum(ProjectTimesheet.hours), 0)).where(
            ProjectTimesheet.project_id == project.id
        )
    )
    approved_changes = await db.scalar(
        select(func.count(ProjectChange.id)).where(
            ProjectChange.project_id == project.id, ProjectChange.status == "approved"
        )
    )
    billed = Decimal(milestones[1])
    return {
        "budget": str(project.budget),
        "milestones_accepted": milestones[0],
        "milestones_total": total_milestones,
        "billed": str(billed),
        "hours": str(Decimal(hours)),
        "approved_changes": approved_changes,
    }
