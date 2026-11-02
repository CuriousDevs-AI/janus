from fastapi import APIRouter, Request

from janus_api.core.deps import CurrentActor, Db, request_ip
from janus_api.core.errors import ApiError
from janus_api.portfolio import (
    access,
    activity,
    companies,
    digest,
    schemas,
    summary,
    targets,
    trends,
)
from janus_api.portfolio.compliance import plan as compliance

router = APIRouter(prefix="/v1/portfolio", tags=["Portfolio"])


@router.get("/summary", response_model=schemas.PortfolioSummary)
async def read_summary(
    actor: CurrentActor, db: Db, request: Request, period: schemas.PeriodKey = "month"
) -> schemas.PortfolioSummary:
    return await summary.summary(
        db, actor.user.id, actor.session.tenant_id, request_ip(request), period
    )


@router.post("/companies", response_model=schemas.CompanyOut, status_code=201)
async def create_company(
    data: schemas.CompanyCreate, actor: CurrentActor, db: Db, request: Request
) -> schemas.CompanyOut:
    return await companies.create_company(
        db, actor.user.id, actor.session.tenant_id, data, request_ip(request)
    )


@router.get("/access", response_model=schemas.AccessList)
async def read_access(actor: CurrentActor, db: Db) -> schemas.AccessList:
    return await access.list_access(db, actor.user.id, actor.session.tenant_id)


@router.post("/access", response_model=schemas.AccessResult)
async def grant_access(
    data: schemas.AccessGrant, actor: CurrentActor, db: Db, request: Request
) -> schemas.AccessResult:
    return await access.grant_access(
        db, actor.user.id, actor.session.tenant_id, data, request_ip(request)
    )


@router.post("/access/remove", response_model=schemas.AccessResult)
async def remove_access(
    data: schemas.AccessRemove, actor: CurrentActor, db: Db, request: Request
) -> schemas.AccessResult:
    return await access.remove_access(
        db, actor.user.id, actor.session.tenant_id, data, request_ip(request)
    )


@router.get("/digest", response_model=schemas.DigestOut)
async def digest_setting(actor: CurrentActor, db: Db) -> schemas.DigestOut:
    return await digest.get_setting(db, actor.user.id)


@router.put("/digest", response_model=schemas.DigestOut)
async def set_digest(
    data: schemas.DigestUpdate, actor: CurrentActor, db: Db, request: Request
) -> schemas.DigestOut:
    return await digest.set_setting(
        db, actor.user.id, actor.session.tenant_id, data.enabled, request_ip(request)
    )


@router.get("/digest/preview", response_model=schemas.DigestPreview)
async def digest_preview(actor: CurrentActor, db: Db) -> schemas.DigestPreview:
    message = await digest.build(db, actor.user.id, actor.user.name, actor.session.tenant_id, None)
    if message is None:
        raise ApiError("not_found", "There is no company in your Portfolio yet.", 404)
    return message


@router.put("/companies/{company_id}/targets", response_model=schemas.Targets)
async def save_targets(
    company_id: str, data: schemas.TargetsUpdate, actor: CurrentActor, db: Db, request: Request
) -> schemas.Targets:
    return await targets.set_targets(
        db, actor.user.id, actor.session.tenant_id, company_id, data, request_ip(request)
    )


@router.put("/companies/{company_id}/compliance", response_model=schemas.CompliancePlan)
async def set_compliance(
    company_id: str, plan: schemas.CompliancePlan, actor: CurrentActor, db: Db, request: Request
) -> schemas.CompliancePlan:
    return await compliance.set_compliance_plan(
        db, actor.user.id, actor.session.tenant_id, company_id, plan, request_ip(request)
    )


@router.put("/companies/{company_id}/filings/{key}", status_code=204)
async def mark_filed(
    company_id: str,
    key: str,
    data: schemas.FilingMark,
    actor: CurrentActor,
    db: Db,
    request: Request,
) -> None:
    await compliance.mark_filing(
        db,
        actor.user.id,
        actor.session.tenant_id,
        company_id,
        key,
        data.filedOn,
        request_ip(request),
        data.acknowledgement,
    )


@router.delete("/companies/{company_id}/filings/{key}", status_code=204)
async def unmark_filed(
    company_id: str, key: str, actor: CurrentActor, db: Db, request: Request
) -> None:
    await compliance.mark_filing(
        db, actor.user.id, actor.session.tenant_id, company_id, key, None, request_ip(request)
    )


@router.put("/companies/{company_id}/registration", response_model=schemas.Registration)
async def set_registration(
    company_id: str, data: schemas.Registration, actor: CurrentActor, db: Db, request: Request
) -> schemas.Registration:
    return await compliance.set_registration(
        db, actor.user.id, actor.session.tenant_id, company_id, data, request_ip(request)
    )


@router.get("/activity", response_model=schemas.ActivityList)
async def read_activity(actor: CurrentActor, db: Db, days: int = 30) -> schemas.ActivityList:
    """What happened lately in every company the person sees, newest first."""
    return await activity.activity(
        db, actor.user.id, actor.session.tenant_id, max(1, min(days, 90))
    )


@router.get("/trends", response_model=schemas.Trends)
async def read_trends(actor: CurrentActor, db: Db, months: int = 6) -> schemas.Trends:
    """Month by month figures for every company the person sees, oldest month first."""
    return await trends.trends(db, actor.user.id, actor.session.tenant_id, max(2, min(months, 12)))


@router.put("/companies/{company_id}/details", response_model=schemas.CompanyDetails)
async def update_details(
    company_id: str, data: schemas.CompanyDetails, actor: CurrentActor, db: Db, request: Request
) -> schemas.CompanyDetails:
    return await companies.update_details(
        db, actor.user.id, actor.session.tenant_id, company_id, data, request_ip(request)
    )
