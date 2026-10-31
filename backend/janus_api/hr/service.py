"""HR records kept on the server, with the access each person's role allows.

Who sees what:
- hr:manage (owners, admins, HR) sees and changes everything, including pay.
- hr:read sees every record, without other people's pay.
- Everyone sees the company directory (without pay) and their own leave and attendance.
- A manager (hr:team or hr:approve) also sees the leave and attendance of the people who report
  to them, and of any request that names them as an approver.

Who changes what:
- Only hr:manage adds or edits employees, or deletes anything.
- A person asks for leave for themselves, always as pending, and may change it while it waits.
- An approver decides a request but cannot change what was asked (dates, days, type, reason).
- A person records their own attendance for today; their manager may correct their team's.

A person is linked to their employee record by email. Someone with no record yet sees the
directory but cannot ask for leave or punch in until HR adds them.
"""

from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select

from janus_api.auth.service import Actor
from janus_api.core.deps import Db
from janus_api.core.errors import ApiError
from janus_api.hr import schemas
from janus_api.hr.models import HrRecord

FULL = "hr:manage"
READ_ALL = "hr:read"
TEAM = ("hr:team", "hr:approve")
PENDING = ("pending", "needs_clarification")
# What a leave request asked for; an approver decides on it but cannot change it.
LEAVE_FACTS = ("employeeId", "employeeName", "type", "from", "to", "days", "reason", "createdAt")
PAY_FIELDS = ("salaryMonthly", "salaryHistory")


def _has(actor: Actor, permission: str) -> bool:
    return permission in actor.permissions


def _team(actor: Actor) -> bool:
    return any(_has(actor, permission) for permission in TEAM)


def _out(row: HrRecord, *, pay: bool) -> schemas.RecordOut:
    data = dict(row.data)
    if row.kind == "employee" and not pay:
        data["salaryMonthly"] = 0
        data.pop("salaryHistory", None)
    return schemas.RecordOut.model_validate(
        {"kind": row.kind, "key": row.key, "version": row.version, "data": data}
    )


async def _me(db: Db, actor: Actor) -> str | None:
    key: str | None = await db.scalar(
        select(HrRecord.key)
        .where(
            HrRecord.tenant_id == actor.session.tenant_id,
            HrRecord.kind == "employee",
            func.lower(HrRecord.data["email"].astext) == actor.user.email.lower(),
        )
        .order_by(HrRecord.id)
        .limit(1)
    )
    return key


async def _reports(db: Db, actor: Actor, me: str | None) -> set[str]:
    """The employees whose reporting manager is this person."""
    if me is None or not _team(actor):
        return set()
    rows = await db.scalars(
        select(HrRecord.key).where(
            HrRecord.tenant_id == actor.session.tenant_id,
            HrRecord.kind == "employee",
            HrRecord.data["managerId"].astext == me,
        )
    )
    return set(rows.all())


def _subject(kind: str, key: str, data: dict[str, Any]) -> str:
    if kind == "employee":
        return key
    subject = data.get("employeeId")
    if not isinstance(subject, str) or not subject:
        raise ApiError("hr_subject", "The record must name the employee it is about.", 422)
    return subject


def _approvers(kind: str, data: dict[str, Any]) -> list[str]:
    if kind != "leave":
        return []
    people = {data.get("managerId")}
    for step in data.get("route") or []:
        if isinstance(step, dict) and step.get("kind") == "person":
            people.add(step.get("id"))
    return sorted(person for person in people if isinstance(person, str) and person)


async def list_records(db: Db, actor: Actor) -> schemas.RecordsOut:
    tenant_id = actor.session.tenant_id
    pay = _has(actor, FULL)
    read_all = pay or _has(actor, READ_ALL)
    me = await _me(db, actor)
    reports = await _reports(db, actor, me)
    rows = (
        await db.scalars(
            select(HrRecord).where(HrRecord.tenant_id == tenant_id).order_by(HrRecord.id)
        )
    ).all()
    out: dict[str, list[schemas.RecordOut]] = {"employee": [], "leave": [], "attendance": []}
    for row in rows:
        if row.kind == "employee":
            out["employee"].append(_out(row, pay=pay or row.key == me))
        elif read_all or row.subject == me or me in row.approvers or row.subject in reports:
            out[row.kind].append(_out(row, pay=pay))
    return schemas.RecordsOut(
        me=me,
        admin=pay,
        seeded=bool(out["employee"]) or any(row.kind == "employee" for row in rows),
        **out,
    )


def _near_today(value: object) -> bool:
    """Own attendance is for today; a day either side allows for time zones."""
    try:
        day = date.fromisoformat(str(value))
    except ValueError:
        return False
    return abs(day - datetime.now(UTC).date()) <= timedelta(days=1)


async def save(
    db: Db, actor: Actor, kind: str, key: str, body: schemas.RecordIn
) -> schemas.RecordOut:
    tenant_id = actor.session.tenant_id
    data = dict(body.data)
    if data.get("id", key) != key:
        raise ApiError("hr_key", "The record's id does not match its address.", 422)
    data["id"] = key
    existing = await db.scalar(
        select(HrRecord)
        .where(HrRecord.tenant_id == tenant_id, HrRecord.kind == kind, HrRecord.key == key)
        .with_for_update()
    )
    if (existing.version if existing else 0) != body.expected_version:
        raise ApiError(
            "version_conflict", "Someone else changed this record. Reload to see it.", 409
        )
    subject = _subject(kind, key, data)
    if not _has(actor, FULL):
        deciding = await _check_write(db, actor, kind, data, subject, existing)
        if existing is not None and deciding:
            for fact in LEAVE_FACTS:
                if fact in existing.data:
                    data[fact] = existing.data[fact]
            subject = existing.subject
    if kind == "employee" and existing is not None and not _has(actor, FULL):
        for field in PAY_FIELDS:
            if field in existing.data:
                data[field] = existing.data[field]
    if existing is None:
        existing = HrRecord(
            tenant_id=tenant_id,
            kind=kind,
            key=key,
            subject=subject,
            approvers=_approvers(kind, data),
            data=data,
            version=1,
            updated_by=actor.user.id,
        )
        db.add(existing)
    else:
        existing.subject = subject
        existing.approvers = _approvers(kind, data)
        existing.data = data
        existing.version += 1
        existing.updated_by = actor.user.id
        existing.updated_at = datetime.now(UTC)
    await db.flush()
    return _out(existing, pay=_has(actor, FULL))


async def _check_write(
    db: Db,
    actor: Actor,
    kind: str,
    data: dict[str, Any],
    subject: str,
    existing: HrRecord | None,
) -> bool:
    """Refuses a save this person may not make. True when they are deciding someone's request."""
    if kind == "employee":
        raise ApiError("hr_forbidden", "Only HR can add or change employee records.", 403)
    me = await _me(db, actor)
    if me is None:
        raise ApiError("no_employee_record", "Ask HR to add your employee record first.", 403)
    reports = await _reports(db, actor, me)
    if kind == "leave":
        if existing is None:
            if subject != me:
                raise ApiError("hr_forbidden", "You can only ask for leave for yourself.", 403)
            if data.get("status") != "pending":
                raise ApiError("leave_pending", "A new leave request starts as pending.", 422)
            return False
        if existing.subject != me and (me in existing.approvers or existing.subject in reports):
            return True
        if existing.subject == me:
            # While it waits, the asker may change or withdraw it (the screens mark that rejected).
            if existing.data.get("status") not in PENDING or data.get("status") not in (
                *PENDING,
                "rejected",
            ):
                raise ApiError(
                    "leave_decided", "This request has been decided; ask HR to change it.", 409
                )
            if subject != me:
                raise ApiError("hr_forbidden", "You can only change your own request.", 403)
            return False
        raise ApiError("hr_forbidden", "You cannot change this request.", 403)
    # attendance
    owner = existing.subject if existing else subject
    if subject != owner:
        raise ApiError("hr_forbidden", "Attendance cannot move to another person.", 403)
    if owner in reports or (owner == me and _near_today(data.get("date"))):
        return False
    raise ApiError(
        "hr_forbidden", "You can record your own attendance for today; ask your manager.", 403
    )


async def delete(db: Db, actor: Actor, kind: str, key: str) -> None:
    if not _has(actor, FULL):
        raise ApiError("hr_forbidden", "Only HR can delete HR records.", 403)
    row = await db.scalar(
        select(HrRecord).where(
            HrRecord.tenant_id == actor.session.tenant_id,
            HrRecord.kind == kind,
            HrRecord.key == key,
        )
    )
    if row is not None:
        await db.delete(row)
        await db.flush()


async def seed(db: Db, actor: Actor, body: schemas.BatchIn) -> schemas.RecordsOut:
    """The first upload: what an HR admin's browser held before HR moved to the server."""
    if not _has(actor, FULL):
        raise ApiError("hr_forbidden", "Only HR can upload HR records.", 403)
    tenant_id = actor.session.tenant_id
    taken = await db.scalar(
        select(func.count())
        .select_from(HrRecord)
        .where(HrRecord.tenant_id == tenant_id, HrRecord.kind == "employee")
    )
    if taken:
        raise ApiError("hr_seeded", "HR records are already on the server.", 409)
    seen: set[tuple[str, str]] = set()
    for kind, items in (
        ("employee", body.employee),
        ("leave", body.leave),
        ("attendance", body.attendance),
    ):
        for item in items:
            key = item.get("id")
            if not isinstance(key, str) or not key or len(key) > 80 or (kind, key) in seen:
                continue
            seen.add((kind, key))
            try:
                subject = _subject(kind, key, item)
            except ApiError:
                continue
            db.add(
                HrRecord(
                    tenant_id=tenant_id,
                    kind=kind,
                    key=key,
                    subject=subject,
                    approvers=_approvers(kind, item),
                    data=item,
                    version=1,
                    updated_by=actor.user.id,
                )
            )
    await db.flush()
    return await list_records(db, actor)
