from typing import Annotated

from fastapi import APIRouter, Depends, Query

from janus_api.auth.schemas import Identifier
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, require
from janus_api.crm import deals, schemas, service

router = APIRouter(prefix="/v1", tags=["CRM"])
Reader = Annotated[Actor, Depends(require("leads:read_own"))]
Writer = Annotated[Actor, Depends(require("leads:write"))]
Limit = Annotated[int, Query(ge=1, le=100)]
AfterId = Annotated[int, Query(ge=0, le=2**63 - 1)]


@router.get("/leads", response_model=list[schemas.LeadOut])
async def leads(
    actor: Reader, db: Db, after_id: AfterId = 0, limit: Limit = 100
) -> list[schemas.LeadOut]:
    return await service.list_leads(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, after_id, limit
    )


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


@router.delete("/leads/{lead_id}", status_code=204)
async def delete_lead(lead_id: Identifier, actor: Writer, db: Db) -> None:
    await service.delete_lead(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, lead_id
    )


@router.get("/contacts/{contact_id}", response_model=schemas.ContactOut)
async def contact(contact_id: Identifier, actor: Reader, db: Db) -> schemas.ContactOut:
    return await service.get_contact(
        db, actor.session.tenant_id, actor.user.id, actor.permissions, contact_id
    )


@router.get("/deals", response_model=list[schemas.DealOut])
async def deals_list(
    actor: Reader, db: Db, after_id: AfterId = 0, limit: Limit = 100
) -> list[schemas.DealOut]:
    return await deals.list_deals(db, actor, after_id, limit)


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
