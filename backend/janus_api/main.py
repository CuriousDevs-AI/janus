import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import monotonic
from uuid import uuid4

from fastapi import FastAPI, Request
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from janus_api.ai.router import router as ai_router
from janus_api.auth.router import router as auth_router
from janus_api.business.router import router as business_router
from janus_api.core.db import check_database_role
from janus_api.core.errors import install_errors
from janus_api.crm.router import router as crm_router
from janus_api.finance.records import router as finance_records_router
from janus_api.finance.router import router as finance_router
from janus_api.it.router import router as it_router
from janus_api.org.router import router as org_router
from janus_api.projects.effort import router as effort_router
from janus_api.projects.planning import router as planning_router
from janus_api.projects.router import router as project_records_router
from janus_api.sources.router import router as sources_router
from janus_api.state.router import router as state_router
from janus_api.support.router import router as support_router
from janus_api.timeline.router import router as timeline_router
from janus_api.vault.router import router as vault_router
from janus_api.whatsapp.router import router as whatsapp_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger = logging.getLogger("janus")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    logger.propagate = False
    await check_database_role()
    yield


app = FastAPI(title="Janus API", version="0.1.0", lifespan=lifespan)
install_errors(app)
app.include_router(auth_router)
app.include_router(ai_router)
app.include_router(business_router)
app.include_router(org_router)
app.include_router(sources_router)
app.include_router(crm_router)
app.include_router(whatsapp_router)
app.include_router(state_router)
app.include_router(vault_router)
app.include_router(timeline_router)
app.include_router(project_records_router)
app.include_router(planning_router)
app.include_router(effort_router)
app.include_router(finance_router)
app.include_router(finance_records_router)
app.include_router(it_router)
app.include_router(support_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.middleware("http")
async def request_metadata(request: Request, call_next: RequestResponseEndpoint) -> Response:
    request.state.request_id = uuid4().hex
    started = monotonic()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["Cache-Control"] = "no-store"
    if origin := getattr(request.state, "website_origin", None):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    # Use the route template, never the URL: invitation URLs contain bearer tokens.
    logging.getLogger("janus").info(
        json.dumps(
            {
                "event": "request",
                "request_id": request.state.request_id,
                "method": request.method,
                "route": getattr(request.scope.get("route"), "path", "unmatched"),
                "status": response.status_code,
                "duration_ms": round((monotonic() - started) * 1000, 2),
            }
        )
    )
    return response
