from fastapi import APIRouter, Request, UploadFile

from janus_api.auth import schemas, service
from janus_api.core.deps import Credentials, CurrentActor, Db, request_device, request_ip
from janus_api.core.storage import MAX_AVATAR_BYTES
from janus_api.org.schemas import InvitationOut

router = APIRouter(prefix="/v1", tags=["Auth & account"])


@router.post("/auth/signup", response_model=schemas.Message, status_code=201)
async def signup(data: schemas.Signup, db: Db, request: Request) -> schemas.Message:
    return await service.signup(db, data, request_ip(request))


@router.post("/auth/verify-email", response_model=schemas.Message)
async def verify_email(data: schemas.TokenRequest, db: Db, request: Request) -> schemas.Message:
    return await service.verify_email(db, data.token, request_ip(request))


@router.post("/auth/resend-verification", response_model=schemas.Message)
async def resend_verification(
    data: schemas.EmailRequest, db: Db, request: Request
) -> schemas.Message:
    return await service.resend_verification(db, str(data.email), request_ip(request))


@router.post("/auth/login", response_model=schemas.TokenPair)
async def login(data: schemas.Login, db: Db, request: Request) -> schemas.TokenPair:
    return await service.login(db, data, request_ip(request), request_device(request))


@router.post("/auth/refresh", response_model=schemas.TokenPair)
async def refresh(data: schemas.Refresh, db: Db, request: Request) -> schemas.TokenPair:
    return await service.refresh(db, data.refresh_token, request_ip(request))


@router.post("/auth/logout", response_model=schemas.Message)
async def logout(actor: CurrentActor, db: Db, request: Request) -> schemas.Message:
    return await service.logout(db, actor, request_ip(request))


@router.post("/auth/logout-all", response_model=schemas.Message)
async def logout_all(actor: CurrentActor, db: Db, request: Request) -> schemas.Message:
    return await service.logout(db, actor, request_ip(request), all_sessions=True)


@router.get("/auth/sessions", response_model=list[schemas.SessionOut])
async def sessions(actor: CurrentActor, db: Db) -> list[schemas.SessionOut]:
    return await service.list_sessions(db, actor)


@router.delete("/auth/sessions/{session_id}", response_model=schemas.Message)
async def revoke_session(
    session_id: schemas.Identifier, actor: CurrentActor, db: Db, request: Request
) -> schemas.Message:
    return await service.revoke_device(db, actor, session_id, request_ip(request))


@router.post("/auth/forgot-password", response_model=schemas.Message)
async def forgot_password(data: schemas.EmailRequest, db: Db, request: Request) -> schemas.Message:
    return await service.forgot_password(db, str(data.email), request_ip(request))


@router.post("/auth/reset-password", response_model=schemas.Message)
async def reset_password(data: schemas.ResetPassword, db: Db, request: Request) -> schemas.Message:
    return await service.reset_password(db, data, request_ip(request))


@router.get("/me", response_model=schemas.Me)
async def me(actor: CurrentActor, db: Db) -> schemas.Me:
    return await service.me(db, actor)


@router.patch("/me", response_model=schemas.UserOut)
async def update_profile(
    data: schemas.ProfileUpdate, actor: CurrentActor, db: Db, request: Request
) -> schemas.UserOut:
    return await service.update_profile(db, actor, data, request_ip(request))


@router.post("/me/avatar", response_model=schemas.UserOut)
async def avatar(
    file: UploadFile, actor: CurrentActor, db: Db, request: Request
) -> schemas.UserOut:
    return await service.avatar(
        db, actor, await file.read(MAX_AVATAR_BYTES + 1), request_ip(request)
    )


@router.post("/me/change-password", response_model=schemas.Message)
async def change_password(
    data: schemas.ChangePassword, actor: CurrentActor, db: Db, request: Request
) -> schemas.Message:
    return await service.change_password(db, actor, data, request_ip(request))


@router.post("/me/change-email", response_model=schemas.Message)
async def change_email(
    data: schemas.ChangeEmail, actor: CurrentActor, db: Db, request: Request
) -> schemas.Message:
    return await service.change_email(db, actor, data, request_ip(request))


@router.post("/me/switch-tenant", response_model=schemas.TokenPair)
async def switch_tenant(
    data: schemas.SwitchTenant, actor: CurrentActor, db: Db, request: Request
) -> schemas.TokenPair:
    return await service.switch_tenant(
        db, actor, data.tenant_id, request_ip(request), request_device(request)
    )


@router.delete("/me", response_model=schemas.Message)
async def delete_account(
    data: schemas.DeleteAccount, actor: CurrentActor, db: Db, request: Request
) -> schemas.Message:
    return await service.delete_account(db, actor, data.password, request_ip(request))


@router.get("/invitations/{token}", response_model=InvitationOut)
async def invitation(token: schemas.Token, db: Db) -> InvitationOut:
    return await service.invitation_details(db, token)


@router.post("/invitations/{token}/accept", response_model=schemas.TokenPair)
async def accept_invitation(
    token: schemas.Token,
    data: schemas.AcceptInvitation,
    db: Db,
    credentials: Credentials,
    request: Request,
) -> schemas.TokenPair:
    return await service.accept_invitation(
        db,
        token,
        data,
        credentials.credentials if credentials else None,
        request_ip(request),
        request_device(request),
    )
