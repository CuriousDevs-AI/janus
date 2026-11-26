from datetime import datetime, timedelta
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, Query, Response, UploadFile
from sqlalchemy import select

from janus_api.auth.models import User
from janus_api.auth.schemas import Identifier
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, require
from janus_api.crm import (
    account,
    activities,
    attachments,
    contacts_list,
    crm_workspace,
    custom_fields,
    deal_items,
    deals,
    duplicates,
    email_templates,
    forecasting,
    overview,
    products,
    quotes,
    reports,
    schemas,
    scoring,
    sequences,
    service,
    tags,
    web_forms,
)
from janus_api.crm.models import Lead

IST = ZoneInfo("Asia/Kolkata")
router = APIRouter(prefix="/v1", tags=["CRM"])
Reader = Annotated[Actor, Depends(require("leads:read_own"))]
Writer = Annotated[Actor, Depends(require("leads:write"))]
# Owners and managers hand leads to their team.
Assigner = Annotated[Actor, Depends(require("leads:assign"))]
Limit = Annotated[int, Query(ge=1, le=100)]
AfterId = Annotated[int, Query(ge=0, le=2**63 - 1)]


@router.get("/leads", response_model=list[schemas.LeadOut])
async def leads(
    actor: Reader,
    db: Db,
    response: Response,
    after_id: AfterId = 0,
    limit: Limit = 100,
    q: str | None = None,
    stage: str | None = None,
    source: str | None = None,
    owner_id: int | None = None,
    tag_id: int | None = None,
    crm_id: int | None = None,
    sort: str | None = None,
) -> list[schemas.LeadOut]:
    rows = await service.list_leads(
        db,
        actor.session.tenant_id,
        actor.user.id,
        actor.permissions,
        after_id,
        limit,
        search=q,
        stage=stage,
        source=source,
        owner_id=owner_id,
        tag_id=tag_id,
        crm_id=crm_id,
        sort=sort,
    )
    response.headers["X-Total-Count"] = str(len(rows))
    return rows


@router.post("/leads", response_model=schemas.LeadOut, status_code=201)
async def create_lead(
    data: schemas.ManualLeadIn,
    actor: Writer,
    db: Db,
    response: Response,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=80)],
    crm_id: int | None = None,
) -> schemas.LeadOut:
    lead, created = await service.create_manual_lead(
        db,
        actor.session.tenant_id,
        actor.user.id,
        actor.permissions,
        data,
        idempotency_key,
        crm_id=crm_id,
    )
    if not created:
        response.status_code = 200
    return lead


@router.get("/leads/filter-options")
async def lead_filter_options(actor: Reader, db: Db, crm_id: int | None = None) -> dict[str, Any]:
    """Distinct stages, sources and owners for filter dropdowns."""
    tid = actor.session.tenant_id
    stage_q = select(Lead.stage).where(Lead.tenant_id == tid).distinct()
    if crm_id is not None:
        stage_q = stage_q.where(Lead.crm_id == crm_id)
    stages = [str(r[0]) for r in (await db.execute(stage_q)).all()]
    src_q = select(Lead.source).where(Lead.tenant_id == tid).distinct()
    if crm_id is not None:
        src_q = src_q.where(Lead.crm_id == crm_id)
    sources_q = [str(r[0]) for r in (await db.execute(src_q)).all()]
    own_q = (
        select(User.id, User.name)
        .select_from(Lead)
        .join(User, User.id == Lead.owner_id)
        .where(Lead.tenant_id == tid, Lead.owner_id.isnot(None))
        .distinct()
    )
    if crm_id is not None:
        own_q = own_q.where(Lead.crm_id == crm_id)
    owner_rows = (await db.execute(own_q)).all()
    return {
        "stages": sorted(stages),
        "sources": sorted(sources_q),
        "owners": [{"id": str(r[0]), "name": r[1]} for r in owner_rows],
    }


@router.get("/leads/{lead_id}", response_model=schemas.LeadOut)
async def lead(lead_id: Identifier, actor: Reader, db: Db) -> schemas.LeadOut:
    return await service.get_lead(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, lead_id
    )


@router.patch("/leads/{lead_id}", response_model=schemas.LeadOut)
async def update_lead(
    lead_id: Identifier,
    data: schemas.LeadUpdate,
    actor: Writer,
    db: Db,
) -> schemas.LeadOut:
    return await service.update_lead(
        db,
        actor.session.tenant_id,
        actor.user.id,
        actor.permissions,
        lead_id,
        data,
    )


@router.get("/leads/{lead_id}/notes", response_model=list[schemas.NoteOut])
async def lead_notes(
    lead_id: Identifier, actor: Reader, db: Db, after_id: AfterId = 0, limit: Limit = 50
) -> list[schemas.NoteOut]:
    return await service.list_notes(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, lead_id, after_id, limit
    )


@router.post("/leads/{lead_id}/notes", response_model=schemas.NoteOut, status_code=201)
async def add_lead_note(
    lead_id: Identifier, data: schemas.NoteIn, actor: Writer, db: Db
) -> schemas.NoteOut:
    return await service.add_note(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, lead_id, data
    )


@router.get(
    "/leads/{lead_id}/events",
    response_model=list[schemas.LeadEvent],
)
async def lead_events(
    lead_id: Identifier, actor: Reader, db: Db, limit: Limit = 50
) -> list[schemas.LeadEvent]:
    return await service.lead_events(
        db, actor.session.tenant_id, lead_id, limit
    )


@router.post("/leads/assign", response_model=schemas.AssignOut)
async def assign_leads(data: schemas.AssignIn, actor: Assigner, db: Db) -> schemas.AssignOut:
    return await service.assign_leads(db, actor.session.tenant_id, actor.user.id, data)


@router.delete("/leads/{lead_id}", status_code=204)
async def delete_lead(lead_id: Identifier, actor: Writer, db: Db) -> None:
    await service.delete_lead(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, lead_id
    )


@router.get("/contacts/{contact_id}/account", response_model=schemas.CustomerAccountOut)
async def contact_account(
    contact_id: Identifier, actor: Reader, db: Db
) -> schemas.CustomerAccountOut:
    """What this customer was invoiced, paid and owes; amounts only for a role with money."""
    return await account.account(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, contact_id
    )


@router.get("/contacts/{contact_id}", response_model=schemas.ContactOut)
async def contact(contact_id: Identifier, actor: Reader, db: Db) -> schemas.ContactOut:
    return await service.get_contact(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, contact_id
    )


@router.patch("/contacts/{contact_id}", response_model=schemas.ContactOut)
async def update_contact(
    contact_id: Identifier, data: schemas.ContactUpdate, actor: Writer, db: Db
) -> schemas.ContactOut:
    return await service.update_contact(
        db,
        actor.session.tenant_id,
        actor.user.id,
        actor.permissions,
        contact_id,
        data,
    )


@router.get("/contacts/{contact_id}/notes", response_model=list[schemas.CustomerNoteOut])
async def contact_notes(
    contact_id: Identifier, actor: Reader, db: Db, after_id: AfterId = 0, limit: Limit = 50
) -> list[schemas.CustomerNoteOut]:
    return await service.list_customer_notes(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, contact_id, after_id, limit
    )


@router.post(
    "/contacts/{contact_id}/notes", response_model=schemas.CustomerNoteOut, status_code=201
)
async def add_contact_note(
    contact_id: Identifier, data: schemas.CustomerNoteIn, actor: Writer, db: Db
) -> schemas.CustomerNoteOut:
    return await service.add_customer_note(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, contact_id, data
    )


@router.patch("/contacts/{contact_id}/consent", response_model=schemas.ContactOut)
async def update_contact_consent(
    contact_id: Identifier, data: schemas.ContactConsentUpdate, actor: Writer, db: Db
) -> schemas.ContactOut:
    return await service.update_contact_consent(
        db,
        actor.session.tenant_id,
        actor.user.id,
        actor.permissions,
        contact_id,
        data,
    )


@router.get("/customers", response_model=list[schemas.CustomerListRow])
async def customers(
    actor: Reader,
    db: Db,
    after_id: AfterId = 0,
    limit: Limit = 50,
    q: str | None = None,
    filter: str = "all",
    crm_id: int | None = None,
) -> list[schemas.CustomerListRow]:
    return await service.list_customers(
        db,
        actor.session.tenant_id,
        actor.user.id,
        actor.permissions,
        after_id,
        limit,
        q,
        filter,
        crm_id=crm_id,
    )


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(contact_id: Identifier, actor: Writer, db: Db) -> None:
    await service.delete_contact(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, contact_id
    )


@router.get("/contacts/{contact_id}/journey", response_model=list[schemas.JourneyEvent])
async def contact_journey(
    contact_id: Identifier, actor: Reader, db: Db, limit: Limit = 50
) -> list[schemas.JourneyEvent]:
    return await service.contact_journey(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, contact_id, limit
    )


@router.post("/contacts/bulk-assign", response_model=schemas.BulkResult)
async def contacts_bulk_assign(
    data: schemas.ContactBulkAssignIn, actor: Assigner, db: Db
) -> schemas.BulkResult:
    return await service.contact_bulk_assign(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, data
    )


@router.post("/contacts/bulk-stage", response_model=schemas.BulkResult)
async def contacts_bulk_stage(
    data: schemas.ContactBulkStageIn, actor: Writer, db: Db
) -> schemas.BulkResult:
    return await service.contact_bulk_stage(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, data
    )


@router.get("/deals", response_model=list[schemas.DealOut])
async def deals_list(
    actor: Reader,
    db: Db,
    after_id: AfterId = 0,
    limit: Limit = 100,
    stage: str | None = None,
    owner_id: int | None = None,
    crm_id: int | None = None,
) -> list[schemas.DealOut]:
    return await deals.list_deals(
        db, actor, after_id, limit, stage=stage, owner_id=owner_id, crm_id=crm_id,
    )


@router.get("/deals/{deal_id}", response_model=schemas.DealOut)
async def deal_detail(deal_id: Identifier, actor: Reader, db: Db) -> schemas.DealOut:
    return deals.output(*await deals.get(db, actor, deal_id))


@router.post("/leads/{lead_id}/deal", response_model=schemas.DealOut)
async def create_deal(
    lead_id: Identifier, data: schemas.DealValues, actor: Writer, db: Db
) -> schemas.DealOut:
    return await deals.create(db, actor, lead_id, data)


@router.put("/deals/{deal_id}", response_model=schemas.DealOut)
async def update_deal(
    deal_id: Identifier, data: schemas.DealUpdate, actor: Writer, db: Db
) -> schemas.DealOut:
    return await deals.update(db, actor, deal_id, data)


@router.get("/deals/{deal_id}/events", response_model=list[schemas.DealEvent])
async def deal_events(
    deal_id: Identifier,
    actor: Reader,
    db: Db,
    before_id: Identifier | None = None,
    limit: Limit = 50,
) -> list[schemas.DealEvent]:
    return await deals.events(db, actor, deal_id, before_id, limit)


@router.get("/lost-reasons", response_model=list[schemas.LostReasonOut])
async def lost_reasons(
    actor: Assigner,
    db: Db,
    days: Annotated[int, Query(ge=1, le=366)] = 90,
    crm_id: int | None = None,
) -> list[schemas.LostReasonOut]:
    """Why the company's leads were lost in the last few days, for whoever runs the team."""
    today = datetime.now(IST).date()
    reasons = await overview.lost_reasons(
        db, actor.session.tenant_id, today - timedelta(days=days - 1), today, crm_id=crm_id
    )
    return [
        schemas.LostReasonOut(
            category=item.category, label=item.label, count=item.count, value=str(item.value)
        )
        for item in reasons
    ]


# ---------------------------------------------------------------------------
# Lead & Contact detail (360-degree views)
# ---------------------------------------------------------------------------


@router.get("/leads/{lead_id}/detail", response_model=schemas.LeadDetailOut)
async def lead_detail_view(lead_id: Identifier, actor: Reader, db: Db) -> schemas.LeadDetailOut:
    return await service.lead_detail(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, lead_id
    )


@router.get("/contacts/{contact_id}/detail", response_model=schemas.ContactDetailOut)
async def contact_detail_view(
    contact_id: Identifier,
    actor: Reader,
    db: Db,
) -> schemas.ContactDetailOut:
    return await service.contact_detail(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, contact_id
    )


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


@router.get("/activities", response_model=list[schemas.ActivityOut])
async def list_activities(
    actor: Reader,
    db: Db,
    contact_id: Identifier | None = None,
    lead_id: Identifier | None = None,
    deal_id: Identifier | None = None,
    after_id: AfterId = 0,
    limit: Limit = 50,
    crm_id: int | None = None,
    kind: str | None = None,
) -> list[schemas.ActivityOut]:
    return await activities.list_activities(
        db,
        actor.session.tenant_id,
        contact_id=contact_id,
        lead_id=lead_id,
        deal_id=deal_id,
        after_id=after_id,
        limit=limit,
        crm_id=crm_id,
        kind=kind,
    )


@router.post("/activities", response_model=schemas.ActivityOut, status_code=201)
async def create_activity(
    data: schemas.ActivityIn,
    actor: Writer,
    db: Db,
) -> schemas.ActivityOut:
    return await activities.create_activity(
        db,
        actor.session.tenant_id,
        actor.user.id,
        data,
    )


@router.patch("/activities/{activity_id}", response_model=schemas.ActivityOut)
async def update_activity(
    activity_id: Identifier,
    data: schemas.ActivityUpdate,
    actor: Writer,
    db: Db,
) -> schemas.ActivityOut:
    return await activities.update_activity(
        db,
        actor.session.tenant_id,
        actor.user.id,
        activity_id,
        data,
    )


@router.post("/activities/{activity_id}/complete", response_model=schemas.ActivityOut)
async def complete_activity(
    activity_id: Identifier,
    data: schemas.ActivityCompleteIn,
    actor: Writer,
    db: Db,
) -> schemas.ActivityOut:
    return await activities.complete_activity(
        db,
        actor.session.tenant_id,
        actor.user.id,
        activity_id,
        data,
    )


@router.delete("/activities/{activity_id}", status_code=204)
async def delete_activity(activity_id: Identifier, actor: Writer, db: Db) -> None:
    await activities.delete_activity(
        db,
        actor.session.tenant_id,
        actor.user.id,
        activity_id,
    )


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


@router.get("/tags", response_model=list[schemas.TagOut])
async def list_tags(actor: Reader, db: Db) -> list[schemas.TagOut]:
    return await tags.list_tags(db, actor.session.tenant_id)


@router.post("/tags", response_model=schemas.TagOut, status_code=201)
async def create_tag(data: schemas.TagIn, actor: Writer, db: Db) -> schemas.TagOut:
    return await tags.create_tag(db, actor.session.tenant_id, actor.user.id, data)


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: Identifier, actor: Writer, db: Db) -> None:
    await tags.delete_tag(db, actor.session.tenant_id, actor.user.id, tag_id)


@router.post("/leads/{lead_id}/tags", status_code=204)
async def tag_lead(
    lead_id: Identifier,
    data: schemas.TagAttach,
    actor: Writer,
    db: Db,
) -> None:
    await tags.tag_lead(
        db,
        actor.session.tenant_id,
        actor.user.id,
        lead_id,
        int(data.tagId),
    )


@router.delete("/leads/{lead_id}/tags/{tag_id}", status_code=204)
async def untag_lead(lead_id: Identifier, tag_id: Identifier, actor: Writer, db: Db) -> None:
    await tags.untag_lead(db, actor.session.tenant_id, actor.user.id, lead_id, tag_id)


@router.post("/contacts/{contact_id}/tags", status_code=204)
async def tag_contact(
    contact_id: Identifier,
    data: schemas.TagAttach,
    actor: Writer,
    db: Db,
) -> None:
    await tags.tag_contact(
        db,
        actor.session.tenant_id,
        actor.user.id,
        contact_id,
        int(data.tagId),
    )


@router.delete("/contacts/{contact_id}/tags/{tag_id}", status_code=204)
async def untag_contact(
    contact_id: Identifier,
    tag_id: Identifier,
    actor: Writer,
    db: Db,
) -> None:
    await tags.untag_contact(db, actor.session.tenant_id, actor.user.id, contact_id, tag_id)


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------


@router.get("/products", response_model=list[schemas.ProductOut])
async def list_products(
    actor: Reader,
    db: Db,
    all: bool = False,
) -> list[schemas.ProductOut]:
    return await products.list_products(db, actor.session.tenant_id, active_only=not all)


@router.post("/products", response_model=schemas.ProductOut, status_code=201)
async def create_product(data: schemas.ProductIn, actor: Writer, db: Db) -> schemas.ProductOut:
    return await products.create_product(db, actor.session.tenant_id, actor.user.id, data)


@router.patch("/products/{product_id}", response_model=schemas.ProductOut)
async def update_product(
    product_id: Identifier,
    data: schemas.ProductUpdate,
    actor: Writer,
    db: Db,
) -> schemas.ProductOut:
    return await products.update_product(
        db,
        actor.session.tenant_id,
        actor.user.id,
        product_id,
        data,
    )


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(product_id: Identifier, actor: Writer, db: Db) -> None:
    await products.delete_product(db, actor.session.tenant_id, actor.user.id, product_id)


# ---------------------------------------------------------------------------
# Deal items
# ---------------------------------------------------------------------------


@router.get("/deals/{deal_id}/items", response_model=list[schemas.DealItemOut])
async def list_deal_items(deal_id: Identifier, actor: Reader, db: Db) -> list[schemas.DealItemOut]:
    return await deal_items.list_items(db, actor.session.tenant_id, deal_id)


@router.post("/deals/{deal_id}/items", response_model=schemas.DealItemOut, status_code=201)
async def add_deal_item(
    deal_id: Identifier,
    data: schemas.DealItemIn,
    actor: Writer,
    db: Db,
) -> schemas.DealItemOut:
    return await deal_items.add_item(db, actor.session.tenant_id, actor.user.id, deal_id, data)


@router.put("/deals/{deal_id}/items/{item_id}", response_model=schemas.DealItemOut)
async def update_deal_item(
    deal_id: Identifier,
    item_id: Identifier,
    data: schemas.DealItemUpdate,
    actor: Writer,
    db: Db,
) -> schemas.DealItemOut:
    return await deal_items.update_item(
        db,
        actor.session.tenant_id,
        actor.user.id,
        deal_id,
        item_id,
        data,
    )


@router.delete("/deals/{deal_id}/items/{item_id}", status_code=204)
async def remove_deal_item(
    deal_id: Identifier,
    item_id: Identifier,
    actor: Writer,
    db: Db,
) -> None:
    await deal_items.remove_item(db, actor.session.tenant_id, actor.user.id, deal_id, item_id)


# ---------------------------------------------------------------------------
# Quotes
# ---------------------------------------------------------------------------


@router.get("/quotes", response_model=list[schemas.QuoteOut])
async def list_quotes(
    actor: Reader,
    db: Db,
    deal_id: Identifier | None = None,
) -> list[schemas.QuoteOut]:
    return await quotes.list_quotes(db, actor.session.tenant_id, deal_id=deal_id)


@router.post("/deals/{deal_id}/quote", response_model=schemas.QuoteOut, status_code=201)
async def create_quote(
    deal_id: Identifier,
    data: schemas.QuoteCreateIn,
    actor: Writer,
    db: Db,
) -> schemas.QuoteOut:
    return await quotes.create_quote(db, actor.session.tenant_id, actor.user.id, deal_id, data)


@router.get("/quotes/{quote_id}", response_model=schemas.QuoteOut)
async def get_quote(quote_id: Identifier, actor: Reader, db: Db) -> schemas.QuoteOut:
    return await quotes.get_quote(db, actor.session.tenant_id, quote_id)


@router.patch("/quotes/{quote_id}", response_model=schemas.QuoteOut)
async def update_quote(
    quote_id: Identifier,
    data: schemas.QuoteStatusUpdate,
    actor: Writer,
    db: Db,
) -> schemas.QuoteOut:
    return await quotes.update_quote_status(
        db,
        actor.session.tenant_id,
        actor.user.id,
        quote_id,
        data,
    )


# ---------------------------------------------------------------------------
# Dashboard & Reports
# ---------------------------------------------------------------------------


@router.get("/dashboard/stats", response_model=schemas.DashboardStats)
async def dashboard_stats(
    actor: Reader, db: Db, crm_id: int | None = None,
) -> schemas.DashboardStats:
    return await reports.dashboard_stats(db, actor.session.tenant_id, crm_id=crm_id)


@router.get("/dashboard/funnel", response_model=list[schemas.FunnelData])
async def dashboard_funnel(
    actor: Reader,
    db: Db,
    days: Annotated[int, Query(ge=1, le=366)] = 30,
    crm_id: int | None = None,
) -> list[schemas.FunnelData]:
    return await reports.funnel_data(db, actor.session.tenant_id, days, crm_id=crm_id)


@router.get("/dashboard/reps", response_model=list[schemas.RepPerformance])
async def dashboard_reps(
    actor: Reader,
    db: Db,
    days: Annotated[int, Query(ge=1, le=366)] = 30,
    crm_id: int | None = None,
) -> list[schemas.RepPerformance]:
    return await reports.rep_performance(db, actor.session.tenant_id, days, crm_id=crm_id)


@router.get("/dashboard/sources", response_model=list[schemas.SourceBreakdown])
async def dashboard_sources(
    actor: Reader,
    db: Db,
    days: Annotated[int, Query(ge=1, le=366)] = 30,
    crm_id: int | None = None,
) -> list[schemas.SourceBreakdown]:
    return await reports.source_breakdown(db, actor.session.tenant_id, days, crm_id=crm_id)


@router.get("/dashboard/daily", response_model=list[schemas.DailyPoint])
async def dashboard_daily(
    actor: Reader,
    db: Db,
    days: Annotated[int, Query(ge=1, le=366)] = 30,
    crm_id: int | None = None,
) -> list[schemas.DailyPoint]:
    return await reports.daily_trend(db, actor.session.tenant_id, days, crm_id=crm_id)


# ---------------------------------------------------------------------------
# Bulk operations
# ---------------------------------------------------------------------------


@router.post("/leads/bulk-stage", response_model=schemas.BulkResult)
async def bulk_stage(data: schemas.BulkStageIn, actor: Writer, db: Db) -> schemas.BulkResult:
    return await service.bulk_stage(
        db,
        actor.session.tenant_id,
        actor.user.id,
        actor.permissions,
        data,
    )


@router.post("/leads/bulk-delete", response_model=schemas.BulkResult)
async def bulk_delete(data: schemas.BulkDeleteIn, actor: Writer, db: Db) -> schemas.BulkResult:
    return await service.bulk_delete(
        db,
        actor.session.tenant_id,
        actor.user.id,
        actor.permissions,
        data,
    )


# ---------------------------------------------------------------------------
# Contacts directory
# ---------------------------------------------------------------------------


@router.get("/contacts", response_model=list[schemas.ContactListRow])
async def list_contacts(
    actor: Reader,
    db: Db,
    q: str | None = None,
    tag_id: Identifier | None = None,
    after_id: AfterId = 0,
    limit: Limit = 50,
) -> list[schemas.ContactListRow]:
    return await contacts_list.list_contacts(
        db,
        actor.session.tenant_id,
        search=q,
        tag_id=tag_id,
        after_id=after_id,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Lead scoring
# ---------------------------------------------------------------------------


@router.get("/leads/{lead_id}/score", response_model=schemas.LeadScoreOut)
async def lead_score(lead_id: Identifier, actor: Reader, db: Db) -> schemas.LeadScoreOut:
    return await scoring.get_lead_score(db, actor.session.tenant_id, lead_id)


@router.post("/leads/score-all", response_model=schemas.BulkScoreResult)
async def score_all_leads(actor: Writer, db: Db) -> schemas.BulkScoreResult:
    return await scoring.bulk_score_leads(db, actor.session.tenant_id)


# ---------------------------------------------------------------------------
# Sales forecasting & targets
# ---------------------------------------------------------------------------


@router.get("/forecast", response_model=schemas.ForecastOut)
async def get_forecast(
    actor: Reader,
    db: Db,
    period: str = Query(pattern=r"^\d{4}-\d{2}$"),
    crm_id: int | None = None,
) -> schemas.ForecastOut:
    return await forecasting.get_forecast(db, actor.session.tenant_id, period, crm_id=crm_id)


@router.get("/forecast/reps", response_model=list[schemas.RepAttainmentOut])
async def forecast_reps(
    actor: Reader,
    db: Db,
    period: str = Query(pattern=r"^\d{4}-\d{2}$"),
    crm_id: int | None = None,
) -> list[schemas.RepAttainmentOut]:
    return await forecasting.rep_attainment(db, actor.session.tenant_id, period, crm_id=crm_id)


@router.post("/targets", response_model=schemas.TargetOut, status_code=201)
async def set_target(
    data: schemas.TargetIn, actor: Writer, db: Db, crm_id: int | None = None
) -> schemas.TargetOut:
    return await forecasting.set_target(
        db, actor.session.tenant_id, actor.user.id, data, crm_id=crm_id,
    )


@router.get("/targets", response_model=list[schemas.TargetOut])
async def list_targets(
    actor: Reader,
    db: Db,
    period: str | None = None,
    crm_id: int | None = None,
) -> list[schemas.TargetOut]:
    return await forecasting.list_targets(db, actor.session.tenant_id, period, crm_id=crm_id)


# ---------------------------------------------------------------------------
# Custom fields
# ---------------------------------------------------------------------------


@router.get(
    "/custom-fields/{entity_type}",
    response_model=list[schemas.CustomFieldDefOut],
)
async def list_custom_field_defs(
    entity_type: str,
    actor: Reader,
    db: Db,
) -> list[schemas.CustomFieldDefOut]:
    return await custom_fields.list_field_defs(db, actor.session.tenant_id, entity_type)


@router.post("/custom-fields", response_model=schemas.CustomFieldDefOut, status_code=201)
async def create_custom_field_def(
    data: schemas.CustomFieldDefIn,
    actor: Writer,
    db: Db,
) -> schemas.CustomFieldDefOut:
    return await custom_fields.create_field_def(db, actor.session.tenant_id, actor.user.id, data)


@router.patch("/custom-fields/{field_id}", response_model=schemas.CustomFieldDefOut)
async def update_custom_field_def(
    field_id: Identifier,
    data: schemas.CustomFieldDefUpdate,
    actor: Writer,
    db: Db,
) -> schemas.CustomFieldDefOut:
    return await custom_fields.update_field_def(
        db, actor.session.tenant_id, actor.user.id, field_id, data
    )


@router.delete("/custom-fields/{field_id}", status_code=204)
async def delete_custom_field_def(field_id: Identifier, actor: Writer, db: Db) -> None:
    await custom_fields.delete_field_def(db, actor.session.tenant_id, actor.user.id, field_id)


@router.get(
    "/custom-field-values/{entity_type}/{entity_id}",
    response_model=list[schemas.CustomFieldValueOut],
)
async def get_custom_field_values(
    entity_type: str,
    entity_id: Identifier,
    actor: Reader,
    db: Db,
) -> list[schemas.CustomFieldValueOut]:
    return await custom_fields.get_field_values(db, actor.session.tenant_id, entity_type, entity_id)


@router.put(
    "/custom-field-values/{entity_type}/{entity_id}/{field_id}",
    response_model=schemas.CustomFieldValueOut,
)
async def set_custom_field_value(
    entity_type: str,
    entity_id: Identifier,
    field_id: Identifier,
    data: schemas.CustomFieldValueIn,
    actor: Writer,
    db: Db,
) -> schemas.CustomFieldValueOut:
    return await custom_fields.set_field_value(
        db, actor.session.tenant_id, field_id, entity_type, entity_id, data
    )


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------


@router.get(
    "/attachments/{entity_type}/{entity_id}",
    response_model=list[schemas.AttachmentOut],
)
async def list_entity_attachments(
    entity_type: str,
    entity_id: Identifier,
    actor: Reader,
    db: Db,
) -> list[schemas.AttachmentOut]:
    return await attachments.list_attachments(db, actor.session.tenant_id, entity_type, entity_id)


@router.post(
    "/attachments/{entity_type}/{entity_id}",
    response_model=schemas.AttachmentOut,
    status_code=201,
)
async def upload_attachment(
    entity_type: str,
    entity_id: Identifier,
    actor: Writer,
    db: Db,
    file: UploadFile,
) -> schemas.AttachmentOut:
    content = await file.read()
    return await attachments.create_attachment(
        db,
        actor.session.tenant_id,
        actor.user.id,
        entity_type,
        entity_id,
        file.filename or "unnamed",
        file.content_type or "application/octet-stream",
        content,
    )


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: Identifier,
    actor: Writer,
    db: Db,
) -> None:
    await attachments.delete_attachment(db, actor.session.tenant_id, actor.user.id, attachment_id)


# ---------------------------------------------------------------------------
# Email templates
# ---------------------------------------------------------------------------


@router.get("/email-templates", response_model=list[schemas.EmailTemplateOut])
async def list_email_templates(
    actor: Reader,
    db: Db,
    category: str | None = None,
) -> list[schemas.EmailTemplateOut]:
    return await email_templates.list_templates(db, actor.session.tenant_id, category)


@router.post("/email-templates", response_model=schemas.EmailTemplateOut, status_code=201)
async def create_email_template(
    data: schemas.EmailTemplateIn,
    actor: Writer,
    db: Db,
) -> schemas.EmailTemplateOut:
    return await email_templates.create_template(db, actor.session.tenant_id, actor.user.id, data)


@router.patch("/email-templates/{template_id}", response_model=schemas.EmailTemplateOut)
async def update_email_template(
    template_id: Identifier,
    data: schemas.EmailTemplateUpdate,
    actor: Writer,
    db: Db,
) -> schemas.EmailTemplateOut:
    return await email_templates.update_template(
        db, actor.session.tenant_id, actor.user.id, template_id, data
    )


@router.delete("/email-templates/{template_id}", status_code=204)
async def delete_email_template(
    template_id: Identifier,
    actor: Writer,
    db: Db,
) -> None:
    await email_templates.delete_template(db, actor.session.tenant_id, actor.user.id, template_id)


@router.post(
    "/email-templates/{template_id}/render",
    response_model=schemas.TemplateRenderOut,
)
async def render_email_template(
    template_id: Identifier,
    data: schemas.TemplateRenderIn,
    actor: Reader,
    db: Db,
) -> schemas.TemplateRenderOut:
    return await email_templates.render_template(
        db, actor.session.tenant_id, template_id, data.context
    )


# ---------------------------------------------------------------------------
# Email sequences
# ---------------------------------------------------------------------------


@router.get("/sequences", response_model=list[schemas.SequenceOut])
async def list_sequences(actor: Reader, db: Db) -> list[schemas.SequenceOut]:
    return await sequences.list_sequences(db, actor.session.tenant_id)


@router.post("/sequences", response_model=schemas.SequenceOut, status_code=201)
async def create_sequence(
    data: schemas.SequenceIn,
    actor: Writer,
    db: Db,
) -> schemas.SequenceOut:
    return await sequences.create_sequence(db, actor.session.tenant_id, actor.user.id, data)


@router.patch("/sequences/{sequence_id}", response_model=schemas.SequenceOut)
async def update_sequence(
    sequence_id: Identifier,
    data: schemas.SequenceUpdate,
    actor: Writer,
    db: Db,
) -> schemas.SequenceOut:
    return await sequences.update_sequence(
        db, actor.session.tenant_id, actor.user.id, sequence_id, data
    )


@router.delete("/sequences/{sequence_id}", status_code=204)
async def delete_sequence(sequence_id: Identifier, actor: Writer, db: Db) -> None:
    await sequences.delete_sequence(db, actor.session.tenant_id, actor.user.id, sequence_id)


# ---------------------------------------------------------------------------
# Web forms
# ---------------------------------------------------------------------------


@router.get("/web-forms", response_model=list[schemas.WebFormOut])
async def list_web_forms(
    actor: Reader, db: Db, crm_id: int | None = None,
) -> list[schemas.WebFormOut]:
    return await web_forms.list_forms(
        db, actor.session.tenant_id, crm_id=crm_id,
    )


@router.post("/web-forms", response_model=schemas.WebFormOut, status_code=201)
async def create_web_form(
    data: schemas.WebFormIn,
    actor: Writer,
    db: Db,
    crm_id: int | None = None,
) -> schemas.WebFormOut:
    return await web_forms.create_form(
        db, actor.session.tenant_id, actor.user.id, data, crm_id=crm_id,
    )


@router.patch("/web-forms/{form_id}", response_model=schemas.WebFormOut)
async def update_web_form(
    form_id: Identifier,
    data: schemas.WebFormUpdate,
    actor: Writer,
    db: Db,
) -> schemas.WebFormOut:
    return await web_forms.update_form(db, actor.session.tenant_id, actor.user.id, form_id, data)


@router.delete("/web-forms/{form_id}", status_code=204)
async def delete_web_form(form_id: Identifier, actor: Writer, db: Db) -> None:
    f = await web_forms.list_forms(db, actor.session.tenant_id)
    target = next((form for form in f if str(form.id) == str(form_id)), None)
    if not target:
        from janus_api.core.errors import ApiError

        raise ApiError("form_not_found", "Web form not found", 404)
    await web_forms.update_form(
        db,
        actor.session.tenant_id,
        actor.user.id,
        form_id,
        schemas.WebFormUpdate(active=False),
    )


@router.post(
    "/web-forms/{slug}/submit",
    response_model=schemas.WebFormSubmitOut,
    status_code=201,
)
async def submit_web_form(
    slug: str,
    data: schemas.WebFormSubmitIn,
    db: Db,
) -> schemas.WebFormSubmitOut:
    _tenant_id, lead_id = await web_forms.submit_form(db, slug, data.data)
    return schemas.WebFormSubmitOut(leadId=str(lead_id))


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------


@router.get(
    "/duplicates/{entity_type}",
    response_model=list[schemas.DuplicateGroupOut],
)
async def find_entity_duplicates(
    entity_type: str,
    actor: Reader,
    db: Db,
) -> list[schemas.DuplicateGroupOut]:
    return await duplicates.find_duplicates(db, actor.session.tenant_id, entity_type)


@router.post(
    "/duplicates/{group_id}/merge",
    response_model=schemas.MergeResult,
)
async def merge_duplicates(
    group_id: Identifier,
    data: schemas.MergeIn,
    actor: Writer,
    db: Db,
) -> schemas.MergeResult:
    return await duplicates.merge_contacts(
        db,
        actor.session.tenant_id,
        actor.user.id,
        group_id,
        int(data.winnerId),
    )


@router.post("/duplicates/{group_id}/dismiss", status_code=204)
async def dismiss_duplicate(
    group_id: Identifier,
    actor: Writer,
    db: Db,
) -> None:
    await duplicates.dismiss_duplicate(db, actor.session.tenant_id, actor.user.id, group_id)


# ---------------------------------------------------------------------------
# CRM Workspaces
# ---------------------------------------------------------------------------

Admin = Annotated[Actor, Depends(require("settings:manage"))]


@router.get("/crm-workspaces", response_model=list[schemas.CrmWorkspaceOut])
async def list_crm_workspaces(actor: Reader, db: Db) -> list[schemas.CrmWorkspaceOut]:
    return await crm_workspace.list_crms(db, actor.session.tenant_id)


@router.post(
    "/crm-workspaces",
    response_model=schemas.CrmWorkspaceOut,
    status_code=201,
)
async def create_crm_workspace(
    data: schemas.CrmWorkspaceIn, actor: Admin, db: Db,
) -> schemas.CrmWorkspaceOut:
    return await crm_workspace.create_crm(
        db, actor.session.tenant_id, actor.user.id, data,
    )


@router.get("/crm-workspaces/{crm_id}", response_model=schemas.CrmWorkspaceOut)
async def get_crm_workspace(
    crm_id: Identifier, actor: Reader, db: Db,
) -> schemas.CrmWorkspaceOut:
    return await crm_workspace.get_crm(
        db, actor.session.tenant_id, crm_id,
    )


@router.patch("/crm-workspaces/{crm_id}", response_model=schemas.CrmWorkspaceOut)
async def update_crm_workspace(
    crm_id: Identifier,
    data: schemas.CrmWorkspaceUpdate,
    actor: Admin,
    db: Db,
) -> schemas.CrmWorkspaceOut:
    return await crm_workspace.update_crm(
        db, actor.session.tenant_id, actor.user.id, crm_id, data,
    )


@router.post(
    "/crm-workspaces/{crm_id}/archive",
    response_model=schemas.CrmWorkspaceOut,
)
async def archive_crm_workspace(
    crm_id: Identifier, actor: Admin, db: Db,
) -> schemas.CrmWorkspaceOut:
    return await crm_workspace.archive_crm(
        db, actor.session.tenant_id, actor.user.id, crm_id,
    )


@router.get(
    "/crm-workspaces/{crm_id}/members",
    response_model=list[schemas.CrmMemberOut],
)
async def list_crm_members(
    crm_id: Identifier, actor: Reader, db: Db,
) -> list[schemas.CrmMemberOut]:
    return await crm_workspace.list_members(
        db, actor.session.tenant_id, crm_id,
    )


@router.post(
    "/crm-workspaces/{crm_id}/members",
    response_model=schemas.CrmMemberOut,
    status_code=201,
)
async def add_crm_member(
    crm_id: Identifier,
    data: schemas.CrmMemberIn,
    actor: Admin,
    db: Db,
) -> schemas.CrmMemberOut:
    return await crm_workspace.add_member(
        db, actor.session.tenant_id, actor.user.id, crm_id, data,
    )


@router.patch(
    "/crm-workspaces/{crm_id}/members/{member_id}",
    response_model=schemas.CrmMemberOut,
)
async def update_crm_member(
    crm_id: Identifier, member_id: Identifier, data: schemas.CrmMemberUpdate, actor: Admin, db: Db,
) -> schemas.CrmMemberOut:
    return await crm_workspace.update_member_role(
        db, actor.session.tenant_id, actor.user.id, crm_id, member_id, data.role,
    )


@router.delete(
    "/crm-workspaces/{crm_id}/members/{member_id}",
    status_code=204,
)
async def remove_crm_member(
    crm_id: Identifier, member_id: Identifier, actor: Admin, db: Db,
) -> None:
    await crm_workspace.remove_member(
        db, actor.session.tenant_id, actor.user.id, crm_id, member_id,
    )
