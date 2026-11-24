"""Server-side company logo storage for the Portfolio."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.models import PortfolioLogo

MAX_SIZE = 200 * 1024
ALLOWED = {"image/png": "image/png", "image/jpeg": "image/jpeg", "image/webp": "image/webp"}
SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)


def _detect(data: bytes) -> str:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    for magic, ct in SIGNATURES:
        if data.startswith(magic):
            return ct
    raise ApiError("invalid_file", "Upload a PNG, JPEG or WebP image.", 422)


async def read(db: AsyncSession, tenant_id: int) -> PortfolioLogo | None:
    return await db.scalar(select(PortfolioLogo).where(PortfolioLogo.tenant_id == tenant_id))


async def save(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    data: bytes,
) -> None:
    if not data:
        raise ApiError("invalid_file", "The file is empty.", 422)
    if len(data) > MAX_SIZE:
        raise ApiError("file_too_large", "Logo must be under 200 KB.", 413)
    content_type = _detect(data)
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        row = await db.scalar(select(PortfolioLogo).where(PortfolioLogo.tenant_id == tenant_id))
        if row is None:
            row = PortfolioLogo(tenant_id=tenant_id, uploaded_by=user_id)
            db.add(row)
        row.content_type = content_type
        row.data = data
        row.uploaded_by = user_id
        await db.flush()
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def remove(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
) -> None:
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        await db.execute(delete(PortfolioLogo).where(PortfolioLogo.tenant_id == tenant_id))
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
