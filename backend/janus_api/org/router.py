from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from janus_api.auth.schemas import Identifier
from janus_api.auth.service import Actor
from janus_api.core.deps import CurrentActor, Db, request_ip, require
from janus_api.org import schemas, service

router = APIRouter(prefix="/v1", tags=["Organisation"])
MemberManager = Annotated[Actor, Depends(require("members:manage"))]
SettingsManager = Annotated[Actor, Depends(require("settings:manage"))]
Limit = Annotated[int, Query(ge=1, le=100)]
AfterId = Annotated[int, Query(ge=0, le=2**63 - 1)]


@router.get("/tenant", response_model=schemas.WorkspaceOut)
async def workspace(actor: CurrentActor, db: Db) -> schemas.WorkspaceOut:
    return await service.get_workspace(db, actor.session.tenant_id)


@router.patch("/tenant", response_model=schemas.WorkspaceOut)
async def update_workspace(
    data: schemas.WorkspaceUpdate, actor: SettingsManager, db: Db, request: Request
) -> schemas.WorkspaceOut:
    return await service.update_workspace(
        db, actor.session.tenant_id, actor.user.id, data, request_ip(request)
    )


@router.get("/members", response_model=list[schemas.MemberOut])
async def members(
    actor: MemberManager, db: Db, after_id: AfterId = 0, limit: Limit = 100
) -> list[schemas.MemberOut]:
    return await service.list_members(db, actor.session.tenant_id, after_id, limit)


@router.patch("/members/{member_id}", response_model=schemas.MemberOut)
async def update_member(
    member_id: Identifier,
    data: schemas.MembershipUpdate,
    actor: MemberManager,
    db: Db,
    request: Request,
) -> schemas.MemberOut:
    return await service.update_membership(
        db, actor.session.tenant_id, actor.user.id, member_id, data, request_ip(request)
    )


@router.get("/roles", response_model=list[schemas.RoleOut])
async def roles(actor: CurrentActor, db: Db) -> list[schemas.RoleOut]:
    return await service.list_roles(db)


@router.post("/invitations", status_code=201, response_model=schemas.InvitationReceipt)
async def invite(
    data: schemas.InvitationCreate, actor: MemberManager, db: Db, request: Request
) -> dict[str, str]:
    return await service.create_invitation(
        db, actor.session.tenant_id, actor.user.id, str(data.email), data.role, request_ip(request)
    )


@router.get("/invitations", response_model=list[schemas.PendingInvitationOut])
async def invitations(
    actor: MemberManager, db: Db, after_id: AfterId = 0, limit: Limit = 100
) -> list[schemas.PendingInvitationOut]:
    return await service.list_invitations(db, actor.session.tenant_id, after_id, limit)


@router.post("/invitations/{invitation_id}/resend", response_model=schemas.InvitationReceipt)
async def resend_invitation(
    invitation_id: Identifier, actor: MemberManager, db: Db, request: Request
) -> schemas.InvitationReceipt:
    return await service.manage_invitation(
        db, actor.session.tenant_id, actor.user.id, invitation_id, request_ip(request), resend=True
    )


@router.delete("/invitations/{invitation_id}", response_model=schemas.InvitationReceipt)
async def revoke_invitation(
    invitation_id: Identifier, actor: MemberManager, db: Db, request: Request
) -> schemas.InvitationReceipt:
    return await service.manage_invitation(
        db, actor.session.tenant_id, actor.user.id, invitation_id, request_ip(request), resend=False
    )


@router.get("/teams", response_model=list[schemas.TeamOut])
async def teams(
    actor: CurrentActor, db: Db, after_id: AfterId = 0, limit: Limit = 100
) -> list[schemas.TeamOut]:
    return await service.list_teams(db, actor.session.tenant_id, after_id, limit)


@router.post("/teams", status_code=201, response_model=schemas.TeamOut)
async def create_team(
    data: schemas.TeamCreate, actor: MemberManager, db: Db, request: Request
) -> schemas.TeamOut:
    return await service.create_team(
        db, actor.session.tenant_id, actor.user.id, data, request_ip(request)
    )


@router.patch("/teams/{team_id}", response_model=schemas.TeamOut)
async def update_team(
    team_id: Identifier, data: schemas.TeamUpdate, actor: MemberManager, db: Db, request: Request
) -> schemas.TeamOut:
    return await service.update_team(
        db, actor.session.tenant_id, actor.user.id, team_id, data, request_ip(request)
    )


@router.delete("/teams/{team_id}", status_code=204)
async def delete_team(
    team_id: Identifier, actor: MemberManager, db: Db, request: Request
) -> Response:
    await service.delete_team(
        db, actor.session.tenant_id, actor.user.id, team_id, request_ip(request)
    )
    return Response(status_code=204)


@router.get("/teams/{team_id}/members", response_model=list[schemas.MemberOut])
async def team_members(
    team_id: Identifier, actor: CurrentActor, db: Db, after_id: AfterId = 0, limit: Limit = 100
) -> list[schemas.MemberOut]:
    return await service.list_team_members(db, actor.session.tenant_id, team_id, after_id, limit)


@router.put("/teams/{team_id}/members/{member_id}", status_code=204)
async def add_team_member(
    team_id: Identifier, member_id: Identifier, actor: MemberManager, db: Db, request: Request
) -> Response:
    await service.add_team_member(
        db, actor.session.tenant_id, actor.user.id, team_id, member_id, request_ip(request)
    )
    return Response(status_code=204)


@router.delete("/teams/{team_id}/members/{member_id}", status_code=204)
async def remove_team_member(
    team_id: Identifier, member_id: Identifier, actor: MemberManager, db: Db, request: Request
) -> Response:
    await service.remove_team_member(
        db, actor.session.tenant_id, actor.user.id, team_id, member_id, request_ip(request)
    )
    return Response(status_code=204)
