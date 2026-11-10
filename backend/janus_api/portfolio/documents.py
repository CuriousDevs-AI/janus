"""Each company's register of documents that expire, and the attention lines for renewals.

A document expiring within 30 days needs the owner (amber); one that has expired is red. The
register keeps the number and dates only, not the file, so it is safe to share with every role
that sees the company.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.models import CompanyDocument

SOON = 30


def document_out(row: CompanyDocument, today: date) -> schemas.CompanyDocumentOut:
    left = (row.expires_on - today).days if row.expires_on else None
    status: str = (
        "no_expiry"
        if left is None
        else "expired"
        if left < 0
        else "expiring"
        if left <= SOON
        else "valid"
    )
    return schemas.CompanyDocumentOut(
        id=str(row.id),
        kind=row.kind,
        name=row.name,
        number=row.number,
        issuedOn=row.issued_on.isoformat() if row.issued_on else None,
        expiresOn=row.expires_on.isoformat() if row.expires_on else None,
        notes=row.notes,
        daysLeft=left,
        status=status,
    )


async def for_company(
    db: AsyncSession, tenant_id: int, today: date
) -> list[schemas.CompanyDocumentOut]:
    """The company's documents, soonest expiry first; the caller is in its context."""
    rows = await db.scalars(
        select(CompanyDocument)
        .where(CompanyDocument.tenant_id == tenant_id)
        .order_by(CompanyDocument.expires_on.asc().nulls_last(), CompanyDocument.id)
        .limit(200)
    )
    return [document_out(row, today) for row in rows]


def attention_lines(
    documents: list[schemas.CompanyDocumentOut],
) -> list[tuple[str, str]]:
    """(severity, text) for documents expired or expiring within 30 days."""
    expired = [doc for doc in documents if doc.status == "expired"]
    soon = [doc for doc in documents if doc.status == "expiring"]
    lines: list[tuple[str, str]] = []
    if expired:
        names = ", ".join(doc.name for doc in expired[:3])
        lines.append(
            ("high", f"{len(expired)} document{'' if len(expired) == 1 else 's'} expired: {names}")
        )
    if soon:
        first = soon[0]
        lines.append(
            (
                "medium",
                f"{len(soon)} document{'' if len(soon) == 1 else 's'} to renew within {SOON}"
                f" days, first {first.name} in {first.daysLeft} day"
                f"{'' if first.daysLeft == 1 else 's'}",
            )
        )
    return lines


async def save(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    document_id: str | None,
    data: schemas.CompanyDocumentIn,
    ip: str | None,
    today: date,
) -> schemas.CompanyDocumentOut:
    if data.issuedOn and data.expiresOn and data.expiresOn < data.issuedOn:
        raise ApiError("invalid_dates", "A document cannot expire before it was issued.", 422)
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        if document_id is None:
            row = CompanyDocument(tenant_id=tenant_id, updated_by=user_id)
            db.add(row)
        else:
            found = (
                await db.get(CompanyDocument, int(document_id)) if document_id.isdigit() else None
            )
            if found is None or found.tenant_id != tenant_id:
                raise ApiError("not_found", "Document not found.", 404)
            row = found
        row.kind, row.name, row.number = data.kind, data.name, data.number or None
        row.issued_on, row.expires_on, row.notes = data.issuedOn, data.expiresOn, data.notes or None
        row.updated_by, row.updated_at = user_id, now()
        await db.flush()
        record(
            db,
            "portfolio.document_saved",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"document": row.id, "kind": row.kind},
        )
        return document_out(row, today)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def remove(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    document_id: str,
    ip: str | None,
) -> None:
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        row = await db.get(CompanyDocument, int(document_id)) if document_id.isdigit() else None
        if row is None or row.tenant_id != tenant_id:
            raise ApiError("not_found", "Document not found.", 404)
        await db.delete(row)
        record(
            db,
            "portfolio.document_removed",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"document": int(document_id)},
        )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
