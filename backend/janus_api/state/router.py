"""Workspace state: the operational stores saved per company.

Reads need an active membership. Writes need the permission for the module that owns the
store, so the server refuses a write the screens would also refuse. Each write must name the
version it was based on; a stale write is refused, never applied over newer data.
"""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from janus_api.core.deps import CurrentActor, Db
from janus_api.core.errors import ApiError
from janus_api.state.models import WorkspaceState

router = APIRouter(prefix="/v1", tags=["Workspace state"])

# Store keys the operational workspaces may save, each with the permission a write needs.
STORE_PERMISSIONS: dict[str, str] = {
    "janus.finance.v1": "billing:manage",
    "janus.vendors.v1": "billing:manage",
    "janus.period-lock.v1": "billing:manage",
    "janus.workflow-rules.v1": "settings:manage",
    "janus.operations.v1": "settings:manage",
    "janus.locations.v1": "settings:manage",
    "janus.projects.v1": "settings:manage",
    "janus.it.v1": "settings:manage",
    "janus.renewals.v1": "settings:manage",
    "janus.feedback.v1": "settings:manage",
    "janus.record-documents.v1": "settings:manage",
}
MAX_DOCUMENT_BYTES = 4_000_000


class StateOut(BaseModel):
    store_key: str
    version: int
    data: dict[str, Any] | None


class StateWrite(BaseModel):
    data: dict[str, Any]
    # The version this save is based on. 0 means the store has never been saved.
    expected_version: int = Field(ge=0)


def _store(store_key: str) -> str:
    if store_key not in STORE_PERMISSIONS:
        raise ApiError("not_found", "Store not found.", 404)
    return store_key


@router.get("/workspace-state/{store_key}", response_model=StateOut)
async def read_state(store_key: str, actor: CurrentActor, db: Db) -> StateOut:
    key = _store(store_key)
    row = await db.scalar(
        select(WorkspaceState).where(
            WorkspaceState.tenant_id == actor.session.tenant_id,
            WorkspaceState.store_key == key,
        )
    )
    if row is None:
        return StateOut(store_key=key, version=0, data=None)
    return StateOut(store_key=key, version=row.version, data=row.data)


@router.put("/workspace-state/{store_key}", response_model=StateOut)
async def write_state(
    store_key: str, data: StateWrite, actor: CurrentActor, db: Db
) -> StateOut:
    key = _store(store_key)
    if STORE_PERMISSIONS[key] not in actor.permissions:
        raise ApiError("forbidden", "You do not have permission to change this workspace.", 403)
    if len(str(data.data)) > MAX_DOCUMENT_BYTES:
        raise ApiError("too_large", "This workspace is too large to save in one go.", 413)
    row = await db.scalar(
        select(WorkspaceState)
        .where(WorkspaceState.tenant_id == actor.session.tenant_id, WorkspaceState.store_key == key)
        .with_for_update()
    )
    current = row.version if row else 0
    if data.expected_version != current:
        raise ApiError(
            "version_conflict",
            "Someone else changed this workspace. Reload to see the latest before saving again.",
            409,
        )
    if row is None:
        row = WorkspaceState(
            tenant_id=actor.session.tenant_id,
            store_key=key,
            data=data.data,
            version=1,
            updated_by=actor.user.id,
        )
        db.add(row)
    else:
        row.data = data.data
        row.version = current + 1
        row.updated_by = actor.user.id
    await db.flush()
    return StateOut(store_key=key, version=row.version, data=row.data)
