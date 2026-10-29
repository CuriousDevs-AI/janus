"""The period lock and the approval and matching rules. Only the owner changes them."""

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from janus_api.audit import service as audit
from janus_api.auth.service import Actor
from janus_api.core.deps import CurrentActor, Db, request_ip, require
from janus_api.rules.models import CompanyRules
from janus_api.rules.service import Rules, rules_for

router = APIRouter(prefix="/v1/company-rules", tags=["Company"])
Owner = Annotated[Actor, Depends(require("billing:manage"))]


class RulesOut(BaseModel):
    locked_through: date | None
    adjustment_approval_value_paise: int
    match_tolerance_percent: float


class RulesIn(BaseModel):
    locked_through: date | None = None
    adjustment_approval_value_paise: int = Field(ge=0, le=10**9)
    match_tolerance_percent: Decimal = Field(ge=0, le=10, max_digits=5, decimal_places=2)


def _out(rules: Rules) -> RulesOut:
    return RulesOut(
        locked_through=rules.locked_through,
        adjustment_approval_value_paise=rules.adjustment_approval_paise,
        match_tolerance_percent=float(rules.match_tolerance_percent),
    )


@router.get("", response_model=RulesOut)
async def get_rules(actor: CurrentActor, db: Db) -> RulesOut:
    return _out(await rules_for(db, actor.session.tenant_id))


@router.put("", response_model=RulesOut)
async def set_rules(data: RulesIn, actor: Owner, db: Db, request: Request) -> RulesOut:
    tenant_id = actor.session.tenant_id
    row = await db.scalar(select(CompanyRules).where(CompanyRules.tenant_id == tenant_id))
    if row is None:
        row = CompanyRules(tenant_id=tenant_id)
        db.add(row)
    row.locked_through = data.locked_through
    row.adjustment_approval_value_paise = data.adjustment_approval_value_paise
    row.match_tolerance_percent = data.match_tolerance_percent
    await db.flush()
    audit.record(
        db,
        "company.rules_changed",
        user_id=actor.user.id,
        tenant_id=tenant_id,
        ip=request_ip(request),
        details={
            "locked_through": data.locked_through.isoformat() if data.locked_through else "open",
            "approval_paise": data.adjustment_approval_value_paise,
            "tolerance": str(data.match_tolerance_percent),
        },
    )
    return _out(await rules_for(db, tenant_id))
