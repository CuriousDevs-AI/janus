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

Every kind of record has a scope (SCOPES): the directory; personal records, about one employee;
HR-only records such as recruitment and payroll issues; company-wide HR settings everyone reads;
and payroll months, which everyone sees without the company's totals so payslips know which
months are final.
"""

from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select

from janus_api.auth.service import Actor
from janus_api.core.deps import Db
from janus_api.core.errors import ApiError
from janus_api.hr import schemas
from janus_api.hr.models import HrRecord
from janus_api.hr.rules import ALL, RULES, Rule

FULL = "hr:manage"
READ_ALL = "hr:read"
TEAM = ("hr:team", "hr:approve")
PENDING = ("pending", "needs_clarification")
# What a leave request asked for; an approver decides on it but cannot change it.
LEAVE_FACTS = ("employeeId", "employeeName", "type", "from", "to", "days", "reason", "createdAt")
PAY_FIELDS = ("salaryMonthly", "salaryHistory")
RUN_TOTALS = ("gross", "deductions", "net", "deltaPercent", "issueCount", "employeeCount")
COMPANY = "company"

SCOPES: dict[str, str] = {
    "employee": "directory",
    # About one employee: they, their manager, their approvers and HR see it.
    "leave": "personal",
    "attendance": "personal",
    "document": "personal",
    "document_extra": "personal",
    "onboarding": "personal",
    "expense": "personal",
    "expense_evidence": "personal",
    "regularisation": "personal",
    "letter": "personal",
    "review": "personal",
    "policy_question": "personal",
    "leave_adjustment": "personal",
    "acknowledgement": "personal",
    "exit": "personal",
    "career": "personal",
    # HR's own work.
    "candidate": "hr",
    "candidate_detail": "hr",
    "onboarding_note": "hr",
    "payroll_issue": "hr",
    "whatsapp": "hr",
    "signature": "hr",
    "compliance": "hr",
    "audit": "hr",
    "import": "hr",
    "filing": "hr",
    # Company-wide HR settings: departments, roles, holidays, policies, leave rules.
    "config": "company",
    "payroll_run": "run",
}
# Personal kinds a person or their manager may write in this slice; the others are HR's for now.
SELF_SERVICE = ("leave", "attendance")


def _has(actor: Actor, permission: str) -> bool:
    return permission in actor.permissions


def _team(actor: Actor) -> bool:
    return any(_has(actor, permission) for permission in TEAM)


def _hide(data: dict[str, Any], path: str) -> None:
    head, _, rest = path.partition(".")
    if rest and isinstance(data.get(head), dict):
        inner = dict(data[head])
        _hide(inner, rest)
        data[head] = inner
    elif not rest and head in data:
        data[head] = 0


def _out(row: HrRecord, *, pay: bool, own: bool = False) -> schemas.RecordOut:
    data = dict(row.data)
    rule = RULES.get(row.kind)
    if rule and not pay and not own:
        for path in rule.hidden_from_managers:
            _hide(data, path)
    if row.kind == "employee" and not pay:
        data["salaryMonthly"] = 0
        data.pop("salaryHistory", None)
    if row.kind == "payroll_run" and not pay:
        for total in RUN_TOTALS:
            if total in data:
                data[total] = 0
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


# Map entries carry no employee: they belong to whoever the record they hang off is about.
PARENT = {"expense_evidence": "expense", "document_extra": "document"}


async def _subject_of(db: Db, tenant_id: int, kind: str, key: str, data: dict[str, Any]) -> str:
    if kind == "acknowledgement":
        # Keyed "<policy>:<version>:<employee>".
        return key.rsplit(":", 1)[-1]
    if kind in PARENT:
        parent = await db.scalar(
            select(HrRecord.subject).where(
                HrRecord.tenant_id == tenant_id, HrRecord.kind == PARENT[kind], HrRecord.key == key
            )
        )
        # Extras of a company-wide document (a policy) are HR's.
        return parent or COMPANY
    return _subject(kind, key, data)


def _subject(kind: str, key: str, data: dict[str, Any]) -> str:
    if kind == "employee":
        return key
    if SCOPES[kind] != "personal":
        return COMPANY
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
    out: dict[str, list[schemas.RecordOut]] = {kind: [] for kind in SCOPES}
    for row in rows:
        scope = SCOPES.get(row.kind)
        if scope == "directory":
            out[row.kind].append(_out(row, pay=pay or row.key == me))
        elif scope in ("company", "run"):
            out[row.kind].append(_out(row, pay=read_all))
        elif scope == "hr":
            if read_all:
                out[row.kind].append(_out(row, pay=pay))
        elif read_all or row.subject == me or me in row.approvers or row.subject in reports:
            out[row.kind].append(_out(row, pay=pay, own=row.subject == me))
    return schemas.RecordsOut(
        me=me,
        admin=pay,
        seeded=bool(out["employee"]),
        records=out,
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
    subject = await _subject_of(db, tenant_id, kind, key, data)
    if not _has(actor, FULL) and kind in RULES:
        data = await _check_personal(db, actor, kind, data, subject, existing)
        subject = existing.subject if existing else subject
    elif not _has(actor, FULL):
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
    return _out(existing, pay=_has(actor, FULL), own=True)


def _fields(rule: Rule, data: dict[str, Any]) -> dict[str, Any]:
    if not rule.in_value:
        return data
    # A map entry's value may be a plain value (an acknowledgement's date), with no fields.
    value = data.get("value")
    return dict(value) if isinstance(value, dict) else {}


def _merge(
    rule: Rule, old: dict[str, Any], new: dict[str, Any], allowed: tuple[str, ...]
) -> dict[str, Any]:
    """The stored record, with only the allowed fields taken from the new copy."""
    if allowed == ALL:
        return new
    before, after = _fields(rule, old), _fields(rule, new)
    merged = {**before, **{name: after[name] for name in allowed if name in after}}
    return {**old, "value": merged} if rule.in_value else merged


async def _check_personal(
    db: Db,
    actor: Actor,
    kind: str,
    data: dict[str, Any],
    subject: str,
    existing: HrRecord | None,
) -> dict[str, Any]:
    """The record to store for this save by someone who is not HR, or a refusal."""
    rule = RULES[kind]
    me = await _me(db, actor)
    if me is None:
        raise ApiError("no_employee_record", "Ask HR to add your employee record first.", 403)
    reports = await _reports(db, actor, me)
    owner = existing.subject if existing else subject
    if subject != owner:
        raise ApiError("hr_forbidden", "A record cannot move to another person.", 403)
    status = _fields(rule, data).get("status")
    if existing is None:
        allowed_values: dict[str, tuple[str, ...]] | None
        if owner == me:
            allowed_values = rule.asker_creates
        elif owner in reports:
            allowed_values = rule.decider_creates
        else:
            allowed_values = None
        if allowed_values is None:
            raise ApiError("hr_forbidden", "Only HR can add this.", 403)
        for name, values in allowed_values.items():
            if _fields(rule, data).get(name) not in values:
                raise ApiError("hr_status", f"A new record starts as {' or '.join(values)}.", 422)
        if kind == "career":
            data = await _with_current_pay(db, actor, data, owner)
        return data
    old = existing.data
    old_status = _fields(rule, old).get("status")
    if owner == me and kind != "career":
        allowed = rule.asker_fields
        if kind == "onboarding" and old.get("ownerRole") != "employee":
            allowed = ()
        if rule.asker_while is not None and (
            old_status not in rule.asker_while or status not in rule.asker_while
        ):
            allowed = ()
        if not allowed:
            raise ApiError("hr_forbidden", "You cannot change this now; ask HR.", 403)
        return _merge(rule, old, data, allowed)
    if owner in reports or me in existing.approvers:
        allowed = rule.decider_fields
        if kind == "onboarding" and old.get("ownerRole") != "manager":
            allowed = ()
        if not allowed:
            raise ApiError("hr_forbidden", "Only HR can change this.", 403)
        if rule.decider_statuses and status != old_status and status not in rule.decider_statuses:
            raise ApiError("hr_status", "Only HR can set that status.", 403)
        return _merge(rule, old, data, allowed)
    raise ApiError("hr_forbidden", "You cannot change this record.", 403)


async def _with_current_pay(
    db: Db, actor: Actor, data: dict[str, Any], employee: str
) -> dict[str, Any]:
    """A manager proposing a change cannot see current pay, so the server records it."""
    record = await db.scalar(
        select(HrRecord.data).where(
            HrRecord.tenant_id == actor.session.tenant_id,
            HrRecord.kind == "employee",
            HrRecord.key == employee,
        )
    )
    before = dict(data.get("before") or {})
    before["salaryMonthly"] = (record or {}).get("salaryMonthly", 0)
    return {**data, "before": before}


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
    if kind == "audit":
        # Everyone's actions are logged; anyone adds an entry, nobody but HR reads or changes one.
        if existing is not None:
            raise ApiError("hr_forbidden", "The HR log cannot be changed.", 403)
        return False
    if kind not in SELF_SERVICE:
        raise ApiError("hr_forbidden", "Only HR can change this.", 403)
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
    row = await db.scalar(
        select(HrRecord).where(
            HrRecord.tenant_id == actor.session.tenant_id,
            HrRecord.kind == kind,
            HrRecord.key == key,
        )
    )
    if not _has(actor, FULL):
        # Someone may withdraw their own request while it waits; anything else is HR's.
        rule = RULES.get(kind)
        mine = row is not None and row.subject == await _me(db, actor)
        waiting = (
            row is not None and rule is not None and row.data.get("status") in rule.asker_withdraws
        )
        if not (mine and waiting):
            raise ApiError("hr_forbidden", "Only HR can delete HR records.", 403)
    if row is not None:
        await db.delete(row)
        await db.flush()


async def seed(db: Db, actor: Actor, body: schemas.BatchIn) -> schemas.RecordsOut:
    """The first upload: what an HR admin's browser held before HR moved to the server."""
    if not _has(actor, FULL):
        raise ApiError("hr_forbidden", "Only HR can upload HR records.", 403)
    tenant_id = actor.session.tenant_id
    # A kind is uploaded only while the server has none of it, so a record HR deleted cannot come
    # back from an old browser. Settings are one record each, so each one is checked on its own.
    present = set(
        (
            await db.scalars(
                select(HrRecord.kind).where(HrRecord.tenant_id == tenant_id).distinct()
            )
        ).all()
    )
    settings = set(
        (
            await db.scalars(
                select(HrRecord.key).where(
                    HrRecord.tenant_id == tenant_id, HrRecord.kind == "config"
                )
            )
        ).all()
    )
    seen: set[tuple[str, str]] = set()
    # Records that hang off another (receipts, document extras) go after it, to find its employee.
    ordered = sorted(body.records.items(), key=lambda pair: pair[0] in PARENT)
    for kind, items in ordered:
        if kind not in SCOPES or (kind in present and kind != "config"):
            continue
        for item in items:
            key = item.get("id")
            if not isinstance(key, str) or not key or len(key) > 80 or (kind, key) in seen:
                continue
            if kind == "config" and key in settings:
                continue
            seen.add((kind, key))
            try:
                subject = await _subject_of(db, tenant_id, kind, key, item)
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
    await db.flush()
    return await list_records(db, actor)
