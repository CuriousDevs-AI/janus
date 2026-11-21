import asyncio
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
from janus_api.audit.router import router as audit_router
from janus_api.auth.router import router as auth_router
from janus_api.billing.router import router as billing_router
from janus_api.business.reports import router as reports_router
from janus_api.business.router import router as business_router
from janus_api.calls.router import public as calls_public_router
from janus_api.calls.router import router as calls_router
from janus_api.core.db import check_database_role
from janus_api.core.errors import install_errors
from janus_api.crm.router import router as crm_router
from janus_api.finance.bills import router as finance_bills_router
from janus_api.finance.books import router as finance_books_router
from janus_api.finance.funds import router as finance_funds_router
from janus_api.finance.records import router as finance_records_router
from janus_api.finance.router import router as finance_router
from janus_api.hr.router import router as hr_router
from janus_api.it.router import router as it_router
from janus_api.operations.router import router as operations_router
from janus_api.org.router import router as org_router
from janus_api.portfolio.router import router as portfolio_router
from janus_api.projects.effort import router as effort_router
from janus_api.projects.planning import router as planning_router
from janus_api.projects.router import router as project_records_router
from janus_api.push.router import router as push_router
from janus_api.rules.router import router as rules_router
from janus_api.sources.router import router as sources_router
from janus_api.state.router import router as state_router
from janus_api.support.router import router as support_router
from janus_api.team.router import router as team_router
from janus_api.timeline.router import router as timeline_router
from janus_api.vault.router import router as vault_router
from janus_api.whatsapp.router import router as whatsapp_router


async def _scheduled_message_loop() -> None:
    from janus_api.core.db import session_factory
    from janus_api.team.service import flush_scheduled

    factory = session_factory()
    logger = logging.getLogger("janus")
    while True:
        try:
            await asyncio.sleep(30)
            async with factory() as db:
                count = await flush_scheduled(db)
                if count:
                    await db.commit()
                    logger.info("Sent %d scheduled message(s)", count)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Scheduled message flush failed")


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
    from janus_api.portfolio.summary import start_warm_up, stop_warm_up

    start_warm_up()
    scheduler_task = asyncio.create_task(_scheduled_message_loop())
    yield
    scheduler_task.cancel()
    stop_warm_up()


app = FastAPI(title="Janus API", version="0.1.0", lifespan=lifespan)
install_errors(app)
app.include_router(auth_router)
app.include_router(ai_router)
app.include_router(business_router)
app.include_router(reports_router)
app.include_router(org_router)
app.include_router(audit_router)
app.include_router(portfolio_router)
app.include_router(billing_router)
app.include_router(sources_router)
app.include_router(crm_router)
app.include_router(whatsapp_router)
app.include_router(calls_router)
app.include_router(calls_public_router)
app.include_router(push_router)
app.include_router(hr_router)
app.include_router(state_router)
app.include_router(vault_router)
app.include_router(timeline_router)
app.include_router(project_records_router)
app.include_router(planning_router)
app.include_router(effort_router)
app.include_router(finance_router)
app.include_router(finance_records_router)
app.include_router(finance_bills_router)
app.include_router(finance_books_router)
app.include_router(finance_funds_router)
app.include_router(rules_router)
app.include_router(it_router)
app.include_router(support_router)
app.include_router(operations_router)
app.include_router(team_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/health/migrate")
async def health_migrate() -> dict[str, str]:
    import subprocess
    info: dict[str, str] = {}
    try:
        result = subprocess.run(
            ["/app/.venv/bin/alembic", "-c", "/app/alembic.ini", "upgrade", "head"],
            capture_output=True, text=True, timeout=120, cwd="/app",
        )
        info["exit_code"] = str(result.returncode)
        info["stdout"] = result.stdout[-1000:] if result.stdout else ""
        info["stderr"] = result.stderr[-1000:] if result.stderr else ""
    except Exception as exc:
        info["error"] = f"{type(exc).__name__}: {exc}"
    return info


@app.get("/health/db")
async def health_db() -> dict[str, str]:
    import os
    import traceback
    from janus_api.core.db import session_factory
    from sqlalchemy import text as sa_text
    info: dict[str, str] = {}
    info["DATABASE_URL"] = "set" if os.environ.get("DATABASE_URL") else "missing"
    info["JANUS_DATABASE_URL"] = "set" if os.environ.get("JANUS_DATABASE_URL") else "missing"
    try:
        factory = session_factory()
        async with factory() as db:
            row = await db.execute(sa_text("SELECT 1"))
            info["db"] = "connected" if row else "no result"
            tables = await db.execute(sa_text(
                "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LIMIT 20"
            ))
            info["tables"] = ",".join(r[0] for r in tables)
            has_rls = await db.execute(sa_text(
                "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' LIMIT 5"
            ))
            info["rls_policies"] = ",".join(f"{r[0]}:{r[1]}" for r in has_rls) or "none"
            role = await db.scalar(sa_text("SELECT current_user"))
            info["role"] = str(role)
            superuser = await db.scalar(sa_text(
                "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
            ))
            info["superuser"] = str(superuser)
    except Exception as exc:
        info["db"] = f"error: {type(exc).__name__}: {exc}"
        info["trace"] = traceback.format_exc()[-500:]
    return info


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
