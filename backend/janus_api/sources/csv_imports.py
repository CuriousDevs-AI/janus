import csv
import hashlib
import io
import json

from fastapi import Request
from sqlalchemy import func, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.org.service import lock_workspace
from janus_api.sources import schemas, service
from janus_api.sources.ingest import MAX_PAYLOAD, event_key, store_event
from janus_api.sources.models import CsvImport, IngestReceipt, RawEvent

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 1000


def parse_rows(body: bytes, mapping: list[dict[str, str]]) -> list[tuple[int, dict[str, object]]]:
    try:
        content = body.decode("utf-8-sig")
        if "\x00" in content:
            raise ValueError("NUL characters are not supported.")
        reader = csv.reader(io.StringIO(content, newline=""), strict=True)
        headers = next(reader, [])
        if (
            not headers
            or len(headers) > 64
            or len(set(headers)) != len(headers)
            or any(
                not h.strip() or len(h) > 200 or any(ord(c) < 32 or ord(c) == 127 for c in h)
                for h in headers
            )
        ):
            raise ValueError("Use 1–64 unique, non-empty column headers (up to 200 characters).")
        if not any(m["mapsTo"] in {"phone", "email"} and m["rawField"] in headers for m in mapping):
            raise ValueError("Map a CSV column to phone or email before uploading.")
        rows: list[tuple[int, dict[str, object]]] = []
        for number, cells in enumerate(reader, start=2):
            if not cells:
                continue
            if len(cells) != len(headers):
                raise ValueError(f"Row {number} must have {len(headers)} columns.")
            payload: dict[str, object] = dict(zip(headers, cells, strict=True))
            if len(json.dumps(payload, ensure_ascii=False).encode()) > MAX_PAYLOAD:
                raise ValueError(f"Row {number} exceeds 256 KB.")
            rows.append((number, payload))
            if len(rows) > MAX_ROWS:
                raise ValueError("Import at most 1,000 data rows per file.")
        if not rows:
            raise ValueError("The CSV must contain at least one data row.")
        return rows
    except UnicodeError as error:
        raise ApiError(
            "invalid_csv", "Save the CSV as UTF-8 (Excel UTF-8 CSV is supported).", 422
        ) from error
    except csv.Error as error:
        raise ApiError(
            "invalid_csv", "Invalid CSV quoting or a field exceeds 128 KB.", 422
        ) from error
    except ValueError as error:
        raise ApiError("invalid_csv", str(error), 422) from error


async def upload(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    connection_id: int,
    file_name: str,
    request: Request,
    ip: str,
) -> schemas.CsvImportReceipt:
    if request.headers.get("Content-Type", "").split(";")[0].strip().lower() != "text/csv":
        raise ApiError("invalid_content_type", "Send the file as a text/csv request body.", 415)
    key = event_key(request.headers.get("Idempotency-Key"))
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_FILE_BYTES:
            raise ApiError("payload_too_large", "CSV exceeds 5 MB.", 413)
        body.extend(chunk)
    await lock_workspace(db, tenant_id, user_id, "sources:manage")
    connection = await service.get_connection(db, connection_id)
    if connection.kind != "csv" or connection.status != "connected":
        raise ApiError("invalid_source", "Use an active CSV source to import leads.", 422)
    file_hash = hashlib.sha256(body).hexdigest()
    previous = await db.scalar(
        select(CsvImport).where(
            CsvImport.connection_id == connection_id,
            CsvImport.idempotency_key == key,
        )
    )
    if previous is not None:
        if previous.file_hash != file_hash:
            raise ApiError(
                "idempotency_conflict", "This key was already used for a different CSV.", 409
            )
        result = await get_import(db, connection_id, previous.id)
        return schemas.CsvImportReceipt(**result.model_dump(), duplicate=True)
    rows = parse_rows(bytes(body), connection.field_mapping)
    batch = CsvImport(
        tenant_id=tenant_id,
        connection_id=connection_id,
        idempotency_key=key,
        file_name=file_name,
        file_hash=file_hash,
        total_rows=len(rows),
    )
    db.add(batch)
    await db.flush()
    # ponytail: capped at 1,000 rows; use bulk inserts if larger imports become necessary.
    for number, payload in rows:
        await store_event(
            db,
            connection,
            payload,
            json.dumps(payload, ensure_ascii=False).encode(),
            f"csv:{batch.id}:{number}",
            csv_import_id=batch.id,
            row_number=number,
        )
    record(
        db,
        "csv.imported",
        tenant_id=tenant_id,
        user_id=user_id,
        ip=ip,
        details={"import_id": batch.id, "connection_id": connection_id, "rows": len(rows)},
    )
    await db.flush()
    result = await get_import(db, connection_id, batch.id)
    return schemas.CsvImportReceipt(**result.model_dump(), duplicate=False)


async def list_imports(
    db: AsyncSession,
    connection_id: int,
    after_id: int,
    limit: int,
    import_id: int | None = None,
) -> list[schemas.CsvImportOut]:
    await service.get_connection(db, connection_id)
    rows = (
        await db.execute(
            select(
                CsvImport,
                func.count(RawEvent.id).filter(RawEvent.status == "processed").label("processed"),
                func.count(RawEvent.id).filter(RawEvent.status == "failed").label("failed"),
            )
            .outerjoin(IngestReceipt, IngestReceipt.csv_import_id == CsvImport.id)
            .outerjoin(
                RawEvent,
                (RawEvent.receipt_id == IngestReceipt.id)
                & (RawEvent.received_day == IngestReceipt.received_day),
            )
            .where(
                CsvImport.connection_id == connection_id,
                CsvImport.id > after_id,
                true() if import_id is None else CsvImport.id == import_id,
            )
            .group_by(CsvImport.id)
            .order_by(CsvImport.id)
            .limit(limit)
        )
    ).all()
    results = []
    for batch, processed, failed in rows:
        pending = batch.total_rows - processed - failed
        results.append(
            schemas.CsvImportOut(
                id=str(batch.id),
                sourceId=str(connection_id),
                fileName=batch.file_name,
                totalRows=batch.total_rows,
                pendingRows=pending,
                processedRows=processed,
                failedRows=failed,
                createdAt=batch.created_at,
                status="processing"
                if pending
                else ("completed_with_errors" if failed else "completed"),
            )
        )
    return results


async def get_import(db: AsyncSession, connection_id: int, import_id: int) -> schemas.CsvImportOut:
    rows = await list_imports(db, connection_id, 0, 1, import_id)
    if not rows:
        raise ApiError("not_found", "CSV import not found.", 404)
    return rows[0]


async def list_rows(
    db: AsyncSession,
    connection_id: int,
    import_id: int,
    after_id: int,
    limit: int,
) -> list[schemas.EventOut]:
    await get_import(db, connection_id, import_id)
    return await service.list_events(db, connection_id, after_id, limit, import_id)
