from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from janus_api.auth.schemas import Identifier
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.sources import api_keys, csv_imports, ingest, schemas, service, website

router = APIRouter(prefix="/v1", tags=["Lead sources"])
SourceManager = Annotated[Actor, Depends(require("sources:manage"))]
Limit = Annotated[int, Query(ge=1, le=100)]
AfterId = Annotated[int, Query(ge=0, le=2**63 - 1)]


@router.post("/sources", status_code=201, response_model=schemas.ConnectionSecret)
async def create(
    data: schemas.ConnectionCreate, actor: SourceManager, db: Db, request: Request
) -> schemas.ConnectionSecret:
    return await service.create_connection(
        db, actor.session.tenant_id, actor.user.id, data, request_ip(request)
    )


@router.get("/sources", response_model=list[schemas.ConnectionOut])
async def connections(
    actor: SourceManager, db: Db, after_id: AfterId = 0, limit: Limit = 100
) -> list[schemas.ConnectionOut]:
    return await service.list_connections(db, after_id, limit)


@router.get("/sources/presets", response_model=list[schemas.PresetOut])
async def presets(actor: SourceManager) -> list[schemas.PresetOut]:
    return service.list_presets()


@router.get("/sources/{connection_id}", response_model=schemas.ConnectionOut)
async def connection(
    connection_id: Identifier, actor: SourceManager, db: Db
) -> schemas.ConnectionOut:
    return await service.connection_with_metrics(
        db, await service.get_connection(db, connection_id)
    )


@router.put("/sources/{connection_id}", response_model=schemas.ConnectionOut)
async def update(
    connection_id: Identifier,
    data: schemas.ConnectionUpdate,
    actor: SourceManager,
    db: Db,
    request: Request,
) -> schemas.ConnectionOut:
    return await service.update_connection(
        db, actor.session.tenant_id, actor.user.id, connection_id, data, request_ip(request)
    )


@router.post("/sources/{connection_id}/rotate-secret", response_model=schemas.ConnectionSecret)
async def rotate(
    connection_id: Identifier, actor: SourceManager, db: Db, request: Request
) -> schemas.ConnectionSecret:
    return await service.rotate_secret(
        db, actor.session.tenant_id, actor.user.id, connection_id, request_ip(request)
    )


@router.get("/sources/{connection_id}/events", response_model=list[schemas.EventOut])
async def events(
    connection_id: Identifier,
    actor: SourceManager,
    db: Db,
    after_id: AfterId = 0,
    limit: Limit = 100,
) -> list[schemas.EventOut]:
    return await service.list_events(db, connection_id, after_id, limit)


@router.api_route(
    "/ingest/webhooks/{public_key}",
    methods=["POST", "GET"],
    responses={
        200: {"description": "Provider receipt or ignored notification"},
        202: {"model": schemas.ReceiptOut},
    },
)
async def webhook(public_key: str, request: Request, db: Db) -> JSONResponse:
    receipt, status = await ingest.receive(db, public_key, request)
    return JSONResponse(receipt.model_dump() if receipt else {}, status_code=status)


@router.get("/sources/{connection_id}/embed")
async def embed(connection_id: Identifier, actor: SourceManager, db: Db) -> dict[str, str]:
    return await website.embed(db, connection_id)


@router.options("/ingest/forms/{public_key}", status_code=204)
async def form_options(public_key: str, request: Request, db: Db) -> Response:
    await website.preflight(db, public_key, request)
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
        },
    )


@router.post("/ingest/forms/{public_key}", status_code=202, response_model=schemas.ReceiptOut)
async def form(public_key: str, request: Request, db: Db) -> schemas.ReceiptOut:
    return await website.receive(db, public_key, request)


@router.post("/sources/{connection_id}/keys", status_code=201, response_model=schemas.ApiKeySecret)
async def create_key(
    connection_id: Identifier,
    data: schemas.ApiKeyCreate,
    actor: SourceManager,
    db: Db,
    request: Request,
) -> schemas.ApiKeySecret:
    return await api_keys.create_key(
        db, actor.session.tenant_id, actor.user.id, connection_id, data, request_ip(request)
    )


@router.get("/sources/{connection_id}/keys", response_model=list[schemas.ApiKeyOut])
async def keys(
    connection_id: Identifier,
    actor: SourceManager,
    db: Db,
    after_id: AfterId = 0,
    limit: Limit = 100,
) -> list[schemas.ApiKeyOut]:
    return await api_keys.list_keys(db, connection_id, after_id, limit)


@router.delete("/sources/{connection_id}/keys/{key_id}", status_code=204)
async def revoke_key(
    connection_id: Identifier, key_id: Identifier, actor: SourceManager, db: Db, request: Request
) -> Response:
    await api_keys.revoke_key(
        db, actor.session.tenant_id, actor.user.id, connection_id, key_id, request_ip(request)
    )
    return Response(status_code=204)


@router.post("/ingest/api/{public_key}", status_code=202, response_model=schemas.ReceiptOut)
async def api_ingest(public_key: str, request: Request, db: Db) -> schemas.ReceiptOut:
    return await api_keys.receive(db, public_key, request)


@router.post(
    "/sources/{connection_id}/imports",
    status_code=202,
    response_model=schemas.CsvImportReceipt,
    openapi_extra={
        "parameters": [
            {
                "name": "Idempotency-Key",
                "in": "header",
                "required": True,
                "description": "Stable key to retry an upload without duplicate leads.",
                "schema": {"type": "string", "pattern": "^[A-Za-z0-9._:-]{1,128}$"},
            }
        ],
        "requestBody": {
            "required": True,
            "content": {"text/csv": {"schema": {"type": "string", "format": "binary"}}},
        },
    },
)
async def import_csv(
    connection_id: Identifier,
    actor: SourceManager,
    db: Db,
    request: Request,
    fileName: Annotated[
        str, Query(min_length=1, max_length=120, pattern=r"^[^\x00-\x1f\x7f/\\]+$")
    ] = "leads.csv",
) -> schemas.CsvImportReceipt:
    return await csv_imports.upload(
        db,
        actor.session.tenant_id,
        actor.user.id,
        connection_id,
        fileName,
        request,
        request_ip(request),
    )


@router.get("/sources/{connection_id}/imports", response_model=list[schemas.CsvImportOut])
async def imports(
    connection_id: Identifier,
    actor: SourceManager,
    db: Db,
    after_id: AfterId = 0,
    limit: Limit = 100,
) -> list[schemas.CsvImportOut]:
    return await csv_imports.list_imports(db, connection_id, after_id, limit)


@router.get("/sources/{connection_id}/imports/{import_id}", response_model=schemas.CsvImportOut)
async def import_status(
    connection_id: Identifier,
    import_id: Identifier,
    actor: SourceManager,
    db: Db,
) -> schemas.CsvImportOut:
    return await csv_imports.get_import(db, connection_id, import_id)


@router.get(
    "/sources/{connection_id}/imports/{import_id}/rows", response_model=list[schemas.EventOut]
)
async def import_rows(
    connection_id: Identifier,
    import_id: Identifier,
    actor: SourceManager,
    db: Db,
    after_id: AfterId = 0,
    limit: Limit = 100,
) -> list[schemas.EventOut]:
    return await csv_imports.list_rows(db, connection_id, import_id, after_id, limit)
