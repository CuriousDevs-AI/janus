"""AI keys kept by the Portfolio: added once for the account, used by Janus Intelligence across
the companies, and copied into the companies that should use it too.

A copy is the company's own key afterwards, kept encrypted under that company and billed to it,
so its Owner or admin sees it in the company's AI settings. The Portfolio remembers where it copied
a key: a changed key or model reaches those companies, and revoking can take it back from them.
The key itself is never sent to a browser; only its last four characters are.
"""

from cryptography.fernet import InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.ai import service as ai
from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import cipher, now
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.models import PortfolioAiKey

FEATURE = "portfolio_ai_key"


async def portfolio_key(db: AsyncSession, user_id: int, provider: str) -> PortfolioAiKey | None:
    """The person's Portfolio key for a provider, read under their own context."""
    return await _row(db, user_id, provider)


async def _row(db: AsyncSession, user_id: int, provider: str) -> PortfolioAiKey | None:
    row: PortfolioAiKey | None = await db.scalar(
        select(PortfolioAiKey).where(
            PortfolioAiKey.user_id == user_id, PortfolioAiKey.provider == provider
        )
    )
    return row


async def _owner(db: AsyncSession, user_id: int) -> None:
    if not await org.owned_tenants(db, user_id):
        raise ApiError("forbidden", "Only an Owner keeps AI keys for the Portfolio.", 403)


def secret(row: PortfolioAiKey) -> str:
    try:
        return cipher().decrypt(row.secret_encrypted.encode()).decode()
    except InvalidToken as error:
        raise ApiError("encryption_unavailable", "The key cannot be decrypted.", 503) from error


async def keys(
    db: AsyncSession, user_id: int, current_tenant: int | None
) -> list[schemas.PortfolioKeyOut]:
    rows = list(
        await db.scalars(
            select(PortfolioAiKey)
            .where(PortfolioAiKey.user_id == user_id)
            .order_by(PortfolioAiKey.id)
        )
    )
    names: dict[int, str] = {}
    try:
        for tenant_id in {tid for row in rows for tid in row.copied_to}:
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            company = await org.company(db, tenant_id)
            names[tenant_id] = company.name if company else str(tenant_id)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return [
        schemas.PortfolioKeyOut(
            provider=row.provider,
            model=row.model,
            keyLastFour=row.key_last_four,
            copiedTo=[
                schemas.CompanyRef(id=str(tid), name=names.get(tid, str(tid)))
                for tid in row.copied_to
            ],
        )
        for row in rows
    ]


async def _copy(
    db: AsyncSession, user_id: int, company_id: str, row: PortfolioAiKey, ip: str
) -> int:
    """Saves the key in one company, as its own; the caller returns to its own context."""
    tenant_id = await enter_company(db, user_id, company_id, "ai:manage")
    await ai.save_key(
        db, tenant_id, user_id, row.provider, {"model": row.model, "apiKey": secret(row)}, ip
    )
    return tenant_id


async def save(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    provider: str,
    data: schemas.PortfolioKeyPut,
    ip: str,
) -> list[schemas.PortfolioKeyOut]:
    """Adds or changes a Portfolio key; the companies holding a copy get the change too."""
    await _owner(db, user_id)
    if provider not in ai.providers() or provider == "openai_compatible":
        raise ApiError("not_found", "Unknown AI provider.", 404)
    row = await _row(db, user_id, provider)
    if row is None:
        if not data.apiKey:
            raise ApiError("api_key_required", "Paste the provider's API key.", 422)
        row = PortfolioAiKey(user_id=user_id, provider=provider, copied_to=[])
        db.add(row)
    if data.apiKey:
        row.secret_encrypted = cipher().encrypt(data.apiKey.encode()).decode()
        row.key_last_four = data.apiKey[-4:]
    row.model, row.updated_at = data.model, now()
    await db.flush()
    record(db, "portfolio.ai_key_saved", user_id=user_id, ip=ip, details={"provider": provider})
    try:
        for tenant_id in list(row.copied_to):
            await _copy(db, user_id, str(tenant_id), row, ip)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return await keys(db, user_id, current_tenant)


async def test(
    db: AsyncSession, user_id: int, current_tenant: int | None, provider: str
) -> tuple[str, str]:
    """Asks the provider a short question with the key; returns (model, answer)."""
    row = await _row(db, user_id, provider)
    if row is None or current_tenant is None:
        raise ApiError("not_found", "That key is not set up.", 404)
    result = await ai.converse_with_key(
        current_tenant,
        row.provider,
        row.model,
        secret(row),
        None,
        [("user", ai.connection_test_prompt())],
        feature="connection_test",
        max_tokens=64,
    )
    return f"{result.usage.model} ({result.usage.provider})", result.text


async def set_companies(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    provider: str,
    data: schemas.PortfolioKeyCompanies,
    ip: str,
) -> list[schemas.PortfolioKeyOut]:
    """Copies the key into the companies chosen and takes it back from those no longer chosen.
    Each needs the person to manage AI there."""
    row = await _row(db, user_id, provider)
    if row is None:
        raise ApiError("not_found", "That key is not set up.", 404)
    wanted = [int(item) for item in dict.fromkeys(data.companies) if item.isdigit()]
    try:
        for tenant_id in [tid for tid in row.copied_to if tid not in wanted]:
            await enter_company(db, user_id, str(tenant_id), "ai:manage")
            if await ai.has_credential(db, provider):
                await ai.delete_credential(db, tenant_id, user_id, provider, ip)  # type: ignore[arg-type]
        for tenant_id in [tid for tid in wanted if tid not in row.copied_to]:
            await _copy(db, user_id, str(tenant_id), row, ip)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    row.copied_to = wanted
    await db.flush()
    record(
        db,
        "portfolio.ai_key_companies",
        user_id=user_id,
        ip=ip,
        details={"provider": provider, "companies": len(wanted)},
    )
    return await keys(db, user_id, current_tenant)


async def revoke(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    provider: str,
    from_companies: bool,
    ip: str,
) -> list[schemas.PortfolioKeyOut]:
    """Deletes the Portfolio's key, and with `from_companies` the copies in the companies too."""
    row = await _row(db, user_id, provider)
    if row is None:
        raise ApiError("not_found", "That key is not set up.", 404)
    if from_companies and row.copied_to:
        await set_companies(
            db, user_id, current_tenant, provider, schemas.PortfolioKeyCompanies(), ip
        )
    await db.delete(row)
    await db.flush()
    record(db, "portfolio.ai_key_revoked", user_id=user_id, ip=ip, details={"provider": provider})
    return await keys(db, user_id, current_tenant)
