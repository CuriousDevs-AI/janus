"""Business Reports that keep: the figures for each report, saved reports, pins and schedules.

A schedule emails a report to members of the business. Each recipient's figures are read under
their own role when it is sent, so the email never says more than they could see on the page; a
member who has left, or whose role does not include the report, is skipped and the page says so.
"""

from datetime import datetime, time
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth.models import User
from janus_api.auth.service import Actor
from janus_api.business.models import ReportPins, ReportSchedule, SavedReport
from janus_api.business.report_figures import ALL_NAMES, Figures, all_figures
from janus_api.business.report_mail import current, deliver, next_due
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.org.models import Membership
from janus_api.portfolio import schemas as portfolio

router = APIRouter(prefix="/v1", tags=["Business reports"])
Reports = Annotated[Actor, Depends(require("reports:read"))]
IST = ZoneInfo("Asia/Kolkata")
SEND_TIME = time(9, 0)

ReportId = Literal[
    "sales-summary",
    "sales-pipeline",
    "conversion-funnel",
    "rep-performance",
    "lead-sources",
    "profit-loss",
    "cash-flow",
    "receivables-aging",
    "expenses",
    "gst-summary",
    "headcount",
    "attendance-leave",
    "payroll-cost",
    "tickets-sla",
    "stock-levels",
    "project-status",
    # The AI Agents' scheduled briefs.
    "health-brief",
    "monthly-review",
]
PeriodKey = Literal["month", "quarter", "fy"]
Frequency = Literal["daily", "weekly", "monthly"]
PERIOD_WORDS = {"month": "this month", "quarter": "this quarter", "fy": "this financial year"}
FREQUENCY_WORDS = {
    "daily": "every morning",
    "weekly": "every Monday morning",
    "monthly": "on the 1st of every month",
}


class FiguresOut(BaseModel):
    """Every report the company's records fill, for one period. `readable` is false where the
    person's role cannot read the company's records at all."""

    readable: bool
    period: portfolio.Period | None = None
    figures: dict[str, Figures] = {}


class SavedIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    report: ReportId
    period: PeriodKey = "month"
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = ""


class SavedOut(SavedIn):
    id: str
    createdBy: str
    createdByName: str
    createdAt: datetime
    mine: bool


class PinsIn(BaseModel):
    reports: list[ReportId] = Field(default_factory=list, max_length=20)


class ScheduleIn(BaseModel):
    report: ReportId
    period: PeriodKey = "month"
    frequency: Frequency
    recipients: list[int] = Field(min_length=1, max_length=50)


class ScheduleUpdate(BaseModel):
    period: PeriodKey | None = None
    frequency: Frequency | None = None
    recipients: list[int] | None = Field(default=None, min_length=1, max_length=50)
    paused: bool | None = None


class Recipient(BaseModel):
    id: str
    name: str
    email: str


class ScheduleOut(BaseModel):
    id: str
    report: str
    reportName: str
    period: str
    frequency: str
    recipients: list[Recipient]
    paused: bool
    nextDueAt: datetime | None
    lastSentAt: datetime | None
    lastProblem: str | None
    createdByName: str


async def _members(db: AsyncSession, tenant_id: int) -> dict[int, tuple[str, str]]:
    """Active members of the business: user id to (name, email)."""
    rows = await db.execute(
        select(User.id, User.name, User.email)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.tenant_id == tenant_id, Membership.status == "active")
    )
    return {row.id: (row.name, row.email) for row in rows}


@router.get("/business/reports/figures", response_model=FiguresOut)
async def read_figures(actor: Reports, db: Db, period: PeriodKey = "month") -> FiguresOut:
    tenant_id = actor.session.tenant_id
    seen = await current(db, actor.user.id, tenant_id, period)
    if seen is None:
        return FiguresOut(readable=False)
    return FiguresOut(readable=True, period=seen[1], figures=all_figures(seen[0]))


def _saved_out(row: SavedReport, names: dict[int, tuple[str, str]], me: int) -> SavedOut:
    return SavedOut(
        id=str(row.id),
        name=row.name,
        report=row.report,
        period=row.period,
        note=row.note,
        createdBy=str(row.created_by),
        createdByName=names.get(row.created_by, ("A former member", ""))[0],
        createdAt=row.created_at,
        mine=row.created_by == me,
    )


@router.get("/business/reports/saved", response_model=list[SavedOut])
async def list_saved(actor: Reports, db: Db) -> list[SavedOut]:
    tenant_id = actor.session.tenant_id
    rows = await db.scalars(
        select(SavedReport).where(SavedReport.tenant_id == tenant_id).order_by(SavedReport.name)
    )
    names = await _members(db, tenant_id)
    return [_saved_out(row, names, actor.user.id) for row in rows]


@router.post("/business/reports/saved", response_model=SavedOut, status_code=201)
async def save_report(data: SavedIn, actor: Reports, db: Db, request: Request) -> SavedOut:
    tenant_id = actor.session.tenant_id
    count = len(
        (await db.scalars(select(SavedReport.id).where(SavedReport.tenant_id == tenant_id))).all()
    )
    if count >= 100:
        raise ApiError(
            "too_many", "A business keeps up to 100 saved reports. Delete one first.", 422
        )
    row = SavedReport(
        tenant_id=tenant_id,
        name=data.name,
        report=data.report,
        period=data.period,
        note=data.note,
        created_by=actor.user.id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    record(db, "report.saved", tenant_id=tenant_id, user_id=actor.user.id, ip=request_ip(request))
    return _saved_out(row, await _members(db, tenant_id), actor.user.id)


def _may_change(actor: Actor, created_by: int) -> None:
    if created_by != actor.user.id and "settings:manage" not in actor.permissions:
        raise ApiError("forbidden", "Only the person who made it, or an admin, can change it.", 403)


@router.delete("/business/reports/saved/{saved_id}", status_code=204)
async def delete_saved(saved_id: int, actor: Reports, db: Db, request: Request) -> None:
    row = await db.get(SavedReport, saved_id)
    if row is None or row.tenant_id != actor.session.tenant_id:
        raise ApiError("not_found", "Saved report not found.", 404)
    _may_change(actor, row.created_by)
    await db.delete(row)
    record(
        db,
        "report.deleted",
        tenant_id=actor.session.tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
    )


async def _pins(db: AsyncSession, tenant_id: int, user_id: int) -> ReportPins | None:
    row: ReportPins | None = await db.scalar(
        select(ReportPins).where(ReportPins.tenant_id == tenant_id, ReportPins.user_id == user_id)
    )
    return row


@router.get("/business/reports/pins", response_model=PinsIn)
async def read_pins(actor: Reports, db: Db) -> PinsIn:
    row = await _pins(db, actor.session.tenant_id, actor.user.id)
    # Someone who never chose starts with the sales summary at the top.
    return PinsIn.model_validate({"reports": row.reports if row else ["sales-summary"]})


@router.put("/business/reports/pins", response_model=PinsIn)
async def save_pins(data: PinsIn, actor: Reports, db: Db) -> PinsIn:
    row = await _pins(db, actor.session.tenant_id, actor.user.id)
    reports: list[str] = list(dict.fromkeys(data.reports))
    if row is None:
        db.add(
            ReportPins(tenant_id=actor.session.tenant_id, user_id=actor.user.id, reports=reports)
        )
    else:
        row.reports = reports
    return PinsIn.model_validate({"reports": reports})


def _schedule_out(row: ReportSchedule, names: dict[int, tuple[str, str]]) -> ScheduleOut:
    return ScheduleOut(
        id=str(row.id),
        report=row.report,
        reportName=ALL_NAMES.get(row.report, row.report),
        period=row.period,
        frequency=row.frequency,
        recipients=[
            Recipient(id=str(user), name=names[user][0], email=names[user][1])
            for user in row.recipients
            if user in names
        ],
        paused=row.paused,
        nextDueAt=None if row.paused else row.next_due_at,
        lastSentAt=row.last_sent_at,
        lastProblem=row.last_problem,
        createdByName=names.get(row.created_by, ("A former member", ""))[0],
    )


async def _recipients(db: AsyncSession, tenant_id: int, wanted: list[int]) -> list[int]:
    members = await _members(db, tenant_id)
    unknown = [user for user in wanted if user not in members]
    if unknown:
        raise ApiError(
            "not_a_member",
            "Reports go only to people in this business. Invite them in People & Access first.",
            422,
        )
    return list(dict.fromkeys(wanted))


@router.get("/business/reports/schedules", response_model=list[ScheduleOut])
async def list_schedules(actor: Reports, db: Db) -> list[ScheduleOut]:
    tenant_id = actor.session.tenant_id
    rows = await db.scalars(
        select(ReportSchedule)
        .where(ReportSchedule.tenant_id == tenant_id)
        .order_by(ReportSchedule.created_at)
    )
    names = await _members(db, tenant_id)
    return [_schedule_out(row, names) for row in rows]


@router.post("/business/reports/schedules", response_model=ScheduleOut, status_code=201)
async def create_schedule(
    data: ScheduleIn, actor: Reports, db: Db, request: Request
) -> ScheduleOut:
    tenant_id = actor.session.tenant_id
    count = len(
        (
            await db.scalars(select(ReportSchedule.id).where(ReportSchedule.tenant_id == tenant_id))
        ).all()
    )
    if count >= 50:
        raise ApiError("too_many", "A business keeps up to 50 schedules. Delete one first.", 422)
    row = ReportSchedule(
        tenant_id=tenant_id,
        report=data.report,
        period=data.period,
        frequency=data.frequency,
        recipients=await _recipients(db, tenant_id, data.recipients),
        next_due_at=next_due(data.frequency, now()),
        created_by=actor.user.id,
    )
    db.add(row)
    await db.flush()
    record(
        db,
        "report.scheduled",
        tenant_id=tenant_id,
        user_id=actor.user.id,
        ip=request_ip(request),
        details={"report": data.report, "frequency": data.frequency},
    )
    return _schedule_out(row, await _members(db, tenant_id))


async def _schedule(db: AsyncSession, actor: Actor, schedule_id: int) -> ReportSchedule:
    row = await db.get(ReportSchedule, schedule_id)
    if row is None or row.tenant_id != actor.session.tenant_id:
        raise ApiError("not_found", "Schedule not found.", 404)
    _may_change(actor, row.created_by)
    return row


@router.patch("/business/reports/schedules/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    schedule_id: int, data: ScheduleUpdate, actor: Reports, db: Db
) -> ScheduleOut:
    row = await _schedule(db, actor, schedule_id)
    if data.period is not None:
        row.period = data.period
    if data.recipients is not None:
        row.recipients = await _recipients(db, row.tenant_id, data.recipients)
    if data.frequency is not None and data.frequency != row.frequency:
        row.frequency = data.frequency
        row.next_due_at = next_due(data.frequency, now())
    if data.paused is not None:
        if row.paused and not data.paused:
            # Resumed: the next send is the next one from today, not every one missed.
            row.next_due_at = next_due(row.frequency, now())
        row.paused = data.paused
    return _schedule_out(row, await _members(db, row.tenant_id))


@router.delete("/business/reports/schedules/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: int, actor: Reports, db: Db) -> None:
    await db.delete(await _schedule(db, actor, schedule_id))


@router.post("/business/reports/schedules/{schedule_id}/send", response_model=ScheduleOut)
async def send_now(schedule_id: int, actor: Reports, db: Db) -> ScheduleOut:
    """Sends it now, to check what recipients get; the regular schedule is unchanged."""
    row = await _schedule(db, actor, schedule_id)
    members = await _members(db, row.tenant_id)
    recipients = [
        {"id": user, "name": members[user][0], "email": members[user][1]}
        for user in row.recipients
        if user in members
    ]
    await deliver(db, row, recipients)
    await set_context(db, user_id=actor.user.id, tenant_id=actor.session.tenant_id)
    if row.last_sent_at is None and row.last_problem:
        raise ApiError("not_sent", row.last_problem, 422)
    return _schedule_out(row, members)
