from typing import Annotated

from fastapi import APIRouter, Depends, Query

from janus_api.audit.events import Area, AuditEvent, events
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, require

router = APIRouter(prefix="/v1", tags=["Audit"])
SettingsManager = Annotated[Actor, Depends(require("settings:manage"))]


@router.get("/audit/events", response_model=list[AuditEvent])
async def audit_events(
    actor: SettingsManager,
    db: Db,
    area: Area | None = None,
    before: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[AuditEvent]:
    """Who changed what in this company, newest first, without page reads and token refreshes."""
    return await events(db, actor.session.tenant_id, area, before, limit)
