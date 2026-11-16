"""Lead scoring: score 0-100 based on completeness, activity and pipeline progress."""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.errors import ApiError
from janus_api.crm import schemas
from janus_api.crm.models import Activity, Deal, Lead, LeadNote, LeadScore

STAGE_SCORES: dict[str, int] = {
    "new": 0,
    "contacted": 5,
    "qualified": 10,
    "demo": 15,
    "proposal": 20,
    "negotiation": 25,
    "approval": 25,
}


async def _compute(db: AsyncSession, tenant_id: int, lead: Lead) -> dict[str, object]:
    factors: dict[str, int] = {}
    score = 0

    if lead.contact_id:
        from janus_api.crm.models import Contact

        contact = await db.get(Contact, lead.contact_id)
        if contact:
            if contact.phone_e164:
                factors["has_phone"] = 10
                score += 10
            if contact.email:
                factors["has_email"] = 10
                score += 10
            if contact.company:
                factors["has_company"] = 5
                score += 5

    activity_count = int(
        await db.scalar(
            select(func.count(Activity.id)).where(
                Activity.tenant_id == tenant_id,
                Activity.lead_id == lead.id,
            )
        )
        or 0
    )
    act_points = min(activity_count * 4, 20)
    factors["activities"] = act_points
    score += act_points

    notes_count = int(
        await db.scalar(
            select(func.count(LeadNote.id)).where(
                LeadNote.tenant_id == tenant_id,
                LeadNote.lead_id == lead.id,
            )
        )
        or 0
    )
    note_points = min(notes_count * 5, 15)
    factors["notes"] = note_points
    score += note_points

    days_since = (datetime.now(UTC) - lead.last_activity_at.replace(tzinfo=UTC)).days
    if days_since > 7:
        penalty = min(days_since - 7, 20)
        factors["inactivity_penalty"] = -penalty
        score -= penalty

    deal = await db.scalar(select(Deal).where(Deal.tenant_id == tenant_id, Deal.lead_id == lead.id))
    if deal:
        factors["has_deal"] = 15
        score += 15

    stage_points = STAGE_SCORES.get(lead.stage, 0)
    factors["stage_progress"] = stage_points
    score += stage_points

    return {"score": max(0, min(100, score)), "factors": factors}


async def calculate_lead_score(
    db: AsyncSession,
    tenant_id: int,
    lead_id: int,
) -> schemas.LeadScoreOut:
    lead = await db.scalar(select(Lead).where(Lead.tenant_id == tenant_id, Lead.id == lead_id))
    if not lead:
        raise ApiError("lead_not_found", "Lead not found", 404)

    result = await _compute(db, tenant_id, lead)
    now = datetime.now(UTC)

    existing = await db.scalar(
        select(LeadScore).where(LeadScore.tenant_id == tenant_id, LeadScore.lead_id == lead_id)
    )
    if existing:
        existing.score = result["score"]  # type: ignore[assignment]
        existing.score_factors = result["factors"]  # type: ignore[assignment]
        existing.calculated_at = now
        existing.updated_at = now
        await db.flush()
        ls = existing
    else:
        ls = LeadScore(
            tenant_id=tenant_id,
            lead_id=lead_id,
            score=result["score"],
            score_factors=result["factors"],
            calculated_at=now,
        )
        db.add(ls)
        await db.flush()

    return schemas.LeadScoreOut(
        leadId=str(ls.lead_id),
        score=ls.score,
        factors=ls.score_factors,
        calculatedAt=ls.calculated_at,
    )


async def get_lead_score(
    db: AsyncSession,
    tenant_id: int,
    lead_id: int,
) -> schemas.LeadScoreOut:
    ls = await db.scalar(
        select(LeadScore).where(LeadScore.tenant_id == tenant_id, LeadScore.lead_id == lead_id)
    )
    if not ls:
        return await calculate_lead_score(db, tenant_id, lead_id)
    return schemas.LeadScoreOut(
        leadId=str(ls.lead_id),
        score=ls.score,
        factors=ls.score_factors,
        calculatedAt=ls.calculated_at,
    )


async def bulk_score_leads(
    db: AsyncSession,
    tenant_id: int,
) -> schemas.BulkScoreResult:
    leads = (
        (
            await db.execute(
                select(Lead).where(
                    Lead.tenant_id == tenant_id,
                    Lead.stage.not_in(("won", "lost")),
                )
            )
        )
        .scalars()
        .all()
    )
    for lead in leads:
        await calculate_lead_score(db, tenant_id, lead.id)
    await db.commit()
    return schemas.BulkScoreResult(scored=len(leads))
