from fastapi import APIRouter, Request, Response

from janus_api.ai import service as ai
from janus_api.core.deps import CurrentActor, Db, request_ip
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.portfolio import (
    access,
    activity,
    alerts,
    bank,
    companies,
    customers,
    digest,
    documents,
    history,
    intelligence,
    intercompany,
    knowledge,
    payroll,
    preferences,
    schemas,
    summary,
    targets,
    trends,
)
from janus_api.portfolio.access import enter_company
from janus_api.portfolio.compliance import plan as compliance
from janus_api.portfolio.periods import today_ist

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
        int(data.amount * 100) if data.amount is not None else None,
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
async def read_trends(
    actor: CurrentActor,
    db: Db,
    unit: trends.Unit = "month",
    count: int | None = None,
    months: int | None = None,
) -> schemas.Trends:
    """Day, week or month figures for every company the person sees, oldest first. `months` is
    the older way of asking for months."""
    # Months: two full years and the one still running, so a year can be set against the one before.
    limits = {"day": (30, 366), "week": (12, 104), "month": (6, 25)}
    default, most = limits[unit]
    wanted = count if count is not None else months if months is not None else default
    return await trends.trends(
        db, actor.user.id, actor.session.tenant_id, unit, max(2, min(wanted, most))
    )


@router.put("/companies/{company_id}/details", response_model=schemas.CompanyDetails)
async def update_details(
    company_id: str, data: schemas.CompanyDetails, actor: CurrentActor, db: Db, request: Request
) -> schemas.CompanyDetails:
    return await companies.update_details(
        db, actor.user.id, actor.session.tenant_id, company_id, data, request_ip(request)
    )


@router.get("/intelligence/models", response_model=schemas.ModelsOut)
async def intelligence_models(actor: CurrentActor, db: Db) -> schemas.ModelsOut:
    return await intelligence.models(db, actor.user.id, actor.session.tenant_id)


@router.post("/intelligence/ask", response_model=schemas.AskOut)
async def intelligence_ask(
    data: schemas.AskIn, actor: CurrentActor, db: Db, request: Request
) -> schemas.AskOut:
    return await intelligence.ask(
        db, actor.user.id, actor.session.tenant_id, request_ip(request), data
    )


@router.get("/intelligence/history", response_model=list[schemas.AskOut])
async def intelligence_history(actor: CurrentActor, db: Db) -> list[schemas.AskOut]:
    return await intelligence.history(db, actor.user.id)


@router.delete("/intelligence/history", status_code=204)
async def intelligence_forget(actor: CurrentActor, db: Db, request: Request) -> Response:
    await intelligence.forget(db, actor.user.id, request_ip(request))
    return Response(status_code=204)


@router.put("/companies/{company_id}/ai/{provider}", response_model=schemas.AiKey)
async def save_ai_key(
    company_id: str,
    provider: schemas.AiProvider,
    data: schemas.AiKeyPut,
    actor: CurrentActor,
    db: Db,
    request: Request,
) -> schemas.AiKey:
    current = actor.session.tenant_id
    try:
        tenant_id = await enter_company(db, actor.user.id, company_id, "ai:manage")
        saved = await ai.save_key(
            db,
            tenant_id,
            actor.user.id,
            provider,
            data.model_dump(exclude_none=True),
            request_ip(request),
        )
    finally:
        await set_context(db, user_id=actor.user.id, tenant_id=current)
    return schemas.AiKey(
        provider=saved.provider,
        model=saved.model,
        keyLastFour=saved.keyLastFour,
        baseUrl=saved.baseUrl,
        enabled=saved.enabled,
    )


@router.delete("/companies/{company_id}/ai/{provider}", status_code=204)
async def remove_ai_key(
    company_id: str,
    provider: schemas.AiProvider,
    actor: CurrentActor,
    db: Db,
    request: Request,
) -> Response:
    current = actor.session.tenant_id
    try:
        tenant_id = await enter_company(db, actor.user.id, company_id, "ai:manage")
        await ai.delete_credential(db, tenant_id, actor.user.id, provider, request_ip(request))
    finally:
        await set_context(db, user_id=actor.user.id, tenant_id=current)
    return Response(status_code=204)


@router.post("/companies/{company_id}/ai/{provider}/test", response_model=schemas.AskOut)
async def test_ai_key(
    company_id: str, provider: schemas.AiProvider, actor: CurrentActor, db: Db
) -> schemas.AskOut:
    current = actor.session.tenant_id
    try:
        await enter_company(db, actor.user.id, company_id, "ai:manage")
        result = await ai.test_connection(db, provider)
    finally:
        await set_context(db, user_id=actor.user.id, tenant_id=current)
    return schemas.AskOut(
        id="test",
        question="Connection test",
        answer=result.text,
        model=f"{result.usage.model} ({result.usage.provider})",
        sources=[],
        grounded=False,
        costUsd=str(result.usage.costUsd) if result.usage.costUsd is not None else None,
        suggested=[],
        createdAt=result.usage.date.isoformat(),
    )


@router.get("/knowledge", response_model=list[schemas.KnowledgeItem])
async def read_knowledge(actor: CurrentActor, db: Db) -> list[schemas.KnowledgeItem]:
    return await knowledge.list_knowledge(db, actor.user.id, actor.session.tenant_id)


@router.post("/knowledge", response_model=list[schemas.KnowledgeItem], status_code=201)
async def add_knowledge(
    data: schemas.KnowledgeAdd, actor: CurrentActor, db: Db, request: Request
) -> list[schemas.KnowledgeItem]:
    return await knowledge.add(
        db, actor.user.id, actor.session.tenant_id, data, request_ip(request)
    )


@router.put("/companies/{company_id}/knowledge/{item_id}/approve", status_code=204)
async def approve_knowledge(
    company_id: str, item_id: str, actor: CurrentActor, db: Db, request: Request
) -> Response:
    await knowledge.decide(
        db, actor.user.id, actor.session.tenant_id, company_id, item_id, True, request_ip(request)
    )
    return Response(status_code=204)


@router.delete("/companies/{company_id}/knowledge/{item_id}", status_code=204)
async def remove_knowledge(
    company_id: str, item_id: str, actor: CurrentActor, db: Db, request: Request
) -> Response:
    await knowledge.decide(
        db, actor.user.id, actor.session.tenant_id, company_id, item_id, False, request_ip(request)
    )
    return Response(status_code=204)


@router.get("/preferences", response_model=schemas.Preferences)
async def read_preferences(actor: CurrentActor, db: Db) -> schemas.Preferences:
    return await preferences.read(db, actor.user.id)


@router.put("/preferences", response_model=schemas.Preferences)
async def save_preferences(
    data: schemas.Preferences, actor: CurrentActor, db: Db
) -> schemas.Preferences:
    return await preferences.save(db, actor.user.id, data)


@router.get("/compliance/register", response_model=list[schemas.RegisterRow])
async def filing_register(actor: CurrentActor, db: Db) -> list[schemas.RegisterRow]:
    return await compliance.register_all(db, actor.user.id, actor.session.tenant_id)


@router.get("/alerts", response_model=schemas.AlertsSetting)
async def alerts_setting(actor: CurrentActor, db: Db) -> schemas.AlertsSetting:
    return schemas.AlertsSetting(enabled=await alerts.get_setting(db, actor.user.id))


@router.put("/alerts", response_model=schemas.AlertsSetting)
async def set_alerts(
    data: schemas.AlertsSetting, actor: CurrentActor, db: Db, request: Request
) -> schemas.AlertsSetting:
    enabled = await alerts.set_setting(db, actor.user.id, data.enabled, request_ip(request))
    return schemas.AlertsSetting(enabled=enabled)


@router.post(
    "/companies/{company_id}/documents",
    response_model=schemas.CompanyDocumentOut,
    status_code=201,
)
async def add_document(
    company_id: str,
    data: schemas.CompanyDocumentIn,
    actor: CurrentActor,
    db: Db,
    request: Request,
) -> schemas.CompanyDocumentOut:
    return await documents.save(
        db,
        actor.user.id,
        actor.session.tenant_id,
        company_id,
        None,
        data,
        request_ip(request),
        today_ist(),
    )


@router.put(
    "/companies/{company_id}/documents/{document_id}", response_model=schemas.CompanyDocumentOut
)
async def update_document(
    company_id: str,
    document_id: str,
    data: schemas.CompanyDocumentIn,
    actor: CurrentActor,
    db: Db,
    request: Request,
) -> schemas.CompanyDocumentOut:
    return await documents.save(
        db,
        actor.user.id,
        actor.session.tenant_id,
        company_id,
        document_id,
        data,
        request_ip(request),
        today_ist(),
    )


@router.delete("/companies/{company_id}/documents/{document_id}", status_code=204)
async def remove_document(
    company_id: str, document_id: str, actor: CurrentActor, db: Db, request: Request
) -> Response:
    await documents.remove(
        db, actor.user.id, actor.session.tenant_id, company_id, document_id, request_ip(request)
    )
    return Response(status_code=204)


@router.get("/intercompany", response_model=list[schemas.IntercompanyLink])
async def intercompany_links(actor: CurrentActor, db: Db) -> list[schemas.IntercompanyLink]:
    return await intercompany.links(db, actor.user.id, actor.session.tenant_id)


@router.post("/intercompany/bills", response_model=schemas.IntercompanyLink, status_code=201)
async def intercompany_bill(
    data: schemas.IntercompanyRecord, actor: CurrentActor, db: Db, request: Request
) -> schemas.IntercompanyLink:
    return await intercompany.record_bill(
        db, actor.user.id, actor.user.name, actor.session.tenant_id, data, request_ip(request)
    )


@router.post("/companies/{company_id}/payroll", status_code=201)
async def post_payroll(
    company_id: str, data: schemas.PayrollPost, actor: CurrentActor, db: Db, request: Request
) -> dict[str, bool]:
    posted = await payroll.post(
        db,
        actor.user.id,
        actor.user.name,
        actor.session.tenant_id,
        company_id,
        data.month,
        request_ip(request),
        data.tds,
    )
    return {"posted": posted}


@router.post(
    "/companies/{company_id}/bank-statement",
    response_model=schemas.BankImported,
    status_code=201,
)
async def import_bank_statement(
    company_id: str,
    data: schemas.BankStatementIn,
    actor: CurrentActor,
    db: Db,
    request: Request,
) -> schemas.BankImported:
    return await bank.import_statement(
        db, actor.user.id, actor.session.tenant_id, company_id, data, request_ip(request)
    )


@router.post("/companies/{company_id}/history", status_code=201)
async def import_history(
    company_id: str, data: schemas.HistoryIn, actor: CurrentActor, db: Db, request: Request
) -> dict[str, int]:
    months = await history.import_months(
        db, actor.user.id, actor.session.tenant_id, company_id, data, request_ip(request)
    )
    return {"months": months}


@router.get("/customers", response_model=schemas.CustomerRetentionList)
async def customer_retention(actor: CurrentActor, db: Db) -> schemas.CustomerRetentionList:
    return await customers.retention(db, actor.user.id, actor.session.tenant_id)


@router.post("/companies/{company_id}/history/customers", status_code=201)
async def import_customer_history(
    company_id: str,
    data: schemas.CustomerHistoryIn,
    actor: CurrentActor,
    db: Db,
    request: Request,
) -> dict[str, int]:
    rows = await history.import_customers(
        db, actor.user.id, actor.session.tenant_id, company_id, data, request_ip(request)
    )
    return {"rows": rows}
