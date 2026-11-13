"""Each company's register of documents that expire, and the attention lines for renewals.

A document expiring within 30 days needs the owner (amber); one that has expired is red. The
register's numbers and dates are shared with every role that sees the company. The file itself (a
PDF or image up to 5 MB, kept in its row under row-level security) is named in the register, but
only people who may change documents can download, replace or remove it.
"""

from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.models import CompanyDocument, CompanyDocumentFile

SOON = 30
MAX_FILE = 5 * 1024 * 1024
# What a document file may be, told by its first bytes, never by its name or the browser's word.
SIGNATURES = (
    (b"%PDF-", "application/pdf", ".pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
)


def file_type(data: bytes) -> tuple[str, str]:
    """(content type, extension) of a PDF, PNG, JPEG or WebP file, from its first bytes."""
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", ".webp"
    for magic, content_type, extension in SIGNATURES:
        if data.startswith(magic):
            return content_type, extension
    raise ApiError("invalid_file", "Attach a PDF, JPEG, PNG or WebP file.", 422)


def document_out(
    row: CompanyDocument, today: date, file: CompanyDocumentFile | None = None
) -> schemas.CompanyDocumentOut:
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
        file=schemas.DocumentFileOut(
            name=file.filename, size=file.size_bytes, contentType=file.content_type
        )
        if file
        else None,
    )


async def for_company(
    db: AsyncSession, tenant_id: int, today: date
) -> list[schemas.CompanyDocumentOut]:
    """The company's documents, soonest expiry first; the caller is in its context."""
    rows = (
        await db.scalars(
            select(CompanyDocument)
            .where(CompanyDocument.tenant_id == tenant_id)
            .order_by(CompanyDocument.expires_on.asc().nulls_last(), CompanyDocument.id)
            .limit(200)
        )
    ).all()
    files = await _files(db, [row.id for row in rows])
    return [document_out(row, today, files.get(row.id)) for row in rows]


async def _files(db: AsyncSession, ids: list[int]) -> dict[int, CompanyDocumentFile]:
    """The files of these documents, without their bytes."""
    if not ids:
        return {}
    rows = await db.scalars(
        select(CompanyDocumentFile)
        .options(defer(CompanyDocumentFile.data))
        .where(CompanyDocumentFile.document_id.in_(ids))
    )
    return {row.document_id: row for row in rows}


async def _document(db: AsyncSession, tenant_id: int, document_id: str) -> CompanyDocument:
    row = await db.get(CompanyDocument, int(document_id)) if document_id.isdigit() else None
    if row is None or row.tenant_id != tenant_id:
        raise ApiError("not_found", "Document not found.", 404)
    return row


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
        files = await _files(db, [row.id])
        record(
            db,
            "portfolio.document_saved",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"document": row.id, "kind": row.kind},
        )
        return document_out(row, today, files.get(row.id))
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


async def attach_file(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    document_id: str,
    filename: str | None,
    data: bytes,
    ip: str | None,
    today: date,
) -> schemas.CompanyDocumentOut:
    """Keeps the document's file, replacing any earlier one."""
    if not data:
        raise ApiError("invalid_file", "The file is empty.", 422)
    if len(data) > MAX_FILE:
        raise ApiError("file_too_large", "Attach a file no larger than 5 MB.", 413)
    content_type, extension = file_type(data)
    base = (filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    stem = base.rsplit(".", 1)[0] if "." in base else base
    name = f"{(stem or 'document')[: 200 - len(extension)]}{extension}"
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        row = await _document(db, tenant_id, document_id)
        await db.execute(
            delete(CompanyDocumentFile).where(CompanyDocumentFile.document_id == row.id)
        )
        file = CompanyDocumentFile(
            tenant_id=tenant_id,
            document_id=row.id,
            filename=name,
            content_type=content_type,
            size_bytes=len(data),
            data=data,
            uploaded_by=user_id,
        )
        db.add(file)
        await db.flush()
        record(
            db,
            "portfolio.document_file_attached",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"document": row.id, "bytes": len(data), "type": content_type},
        )
        return document_out(row, today, file)
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def read_file(
    db: AsyncSession, user_id: int, current_tenant: int | None, company_id: str, document_id: str
) -> CompanyDocumentFile:
    """The document's file with its bytes, for someone who may change the company's documents."""
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        row = await _document(db, tenant_id, document_id)
        file = await db.scalar(
            select(CompanyDocumentFile).where(CompanyDocumentFile.document_id == row.id)
        )
        if file is None:
            raise ApiError("not_found", "This document has no file.", 404)
        record(
            db,
            "portfolio.document_file_downloaded",
            user_id=user_id,
            tenant_id=tenant_id,
            details={"document": row.id},
        )
        return file
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def remove_file(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    document_id: str,
    ip: str | None,
) -> None:
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        row = await _document(db, tenant_id, document_id)
        if row.id not in await _files(db, [row.id]):
            raise ApiError("not_found", "This document has no file.", 404)
        await db.execute(
            delete(CompanyDocumentFile).where(CompanyDocumentFile.document_id == row.id)
        )
        record(
            db,
            "portfolio.document_file_removed",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"document": row.id},
        )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
