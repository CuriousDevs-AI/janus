"""Adding a company from the Portfolio."""

from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import schemas

# A login may own this many companies, so a runaway script cannot create tenants without end.
MAX_COMPANIES = 20


async def create_company(
    db: AsyncSession, user_id: int, current_tenant: int, data: schemas.CompanyCreate, ip: str
) -> schemas.CompanyOut:
    """A new company with this person as its Owner.

    Only an Owner of the current company may add one.
    """
    owned = await org.owned_tenants(db, user_id)
    if current_tenant not in owned:
        raise ApiError("forbidden", "Only an Owner can add a company.", 403)
    if len(owned) >= MAX_COMPANIES:
        raise ApiError("company_limit", f"One login can own up to {MAX_COMPANIES} companies.", 409)
    try:
        tenant_id = await org_service.create_workspace(db, user_id, data.name)
        await org_service.set_industry(db, tenant_id, data.industry)
        record(
            db,
            "portfolio.company_created",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"from_tenant": current_tenant},
        )
        company = await org.company(db, tenant_id)
        assert company is not None
        out = schemas.CompanyOut(id=str(company.id), name=company.name, industry=company.industry)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return out
