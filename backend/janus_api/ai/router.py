from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from janus_api.ai import schemas, service
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require

router = APIRouter(prefix="/v1/ai", tags=["AI settings"])
AIManager = Annotated[Actor, Depends(require("ai:manage"))]


@router.get("/credentials", response_model=list[schemas.CredentialOut])
async def credentials(actor: AIManager, db: Db) -> list[schemas.CredentialOut]:
    return await service.list_credentials(db)


@router.put("/credentials/{provider}", response_model=schemas.CredentialOut)
async def save_credential(
    provider: schemas.Provider,
    data: schemas.CredentialPut,
    actor: AIManager,
    db: Db,
    request: Request,
) -> schemas.CredentialOut:
    return await service.put_credential(
        db, actor.session.tenant_id, actor.user.id, provider, data, request_ip(request)
    )


@router.delete("/credentials/{provider}", status_code=204)
async def remove_credential(
    provider: schemas.Provider,
    actor: AIManager,
    db: Db,
    request: Request,
) -> Response:
    await service.delete_credential(
        db, actor.session.tenant_id, actor.user.id, provider, request_ip(request)
    )
    return Response(status_code=204)


@router.post("/credentials/{provider}/test", response_model=schemas.CompletionOut)
async def test_connection(
    provider: schemas.Provider, actor: AIManager, db: Db
) -> schemas.CompletionOut:
    return await service.test_connection(db, provider)


@router.get("/usage", response_model=list[schemas.UsageOut])
async def usage(
    actor: AIManager,
    db: Db,
    after_id: Annotated[int, Query(ge=0, le=2**63 - 1)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[schemas.UsageOut]:
    return await service.list_usage(db, after_id, limit)
