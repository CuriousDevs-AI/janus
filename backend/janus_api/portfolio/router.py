from fastapi import APIRouter, Request

from janus_api.core.deps import CurrentActor, Db, request_ip
from janus_api.portfolio import schemas, service

router = APIRouter(prefix="/v1/portfolio", tags=["Portfolio"])


@router.get("/summary", response_model=schemas.PortfolioSummary)
async def summary(actor: CurrentActor, db: Db, request: Request) -> schemas.PortfolioSummary:
    return await service.summary(db, actor.user.id, actor.session.tenant_id, request_ip(request))


@router.post("/companies", response_model=schemas.CompanyOut, status_code=201)
async def create_company(
    data: schemas.CompanyCreate, actor: CurrentActor, db: Db, request: Request
) -> schemas.CompanyOut:
    return await service.create_company(
        db, actor.user.id, actor.session.tenant_id, data, request_ip(request)
    )
