"""Which filings apply to a company, and marking them filed."""

from datetime import date, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company, readable_companies
from janus_api.portfolio.compliance import due_dates
from janus_api.portfolio.models import CompanyRegistration, ComplianceFiling, ComplianceProfile
from janus_api.portfolio.periods import today_ist

COMPANIES = ("pvt_ltd", "public_ltd", "opc")


def _rules(
    profile: ComplianceProfile, registration: CompanyRegistration | None = None
) -> due_dates.Profile:
    return due_dates.Profile(
        profile.gst_filing,
        profile.tds,
        profile.pf_esi,
        profile.company,
        llp=bool(registration and registration.entity_type == "llp"),
        pt_state=registration.pt_state if registration else None,
    )


async def _registration(db: AsyncSession, tenant_id: int) -> CompanyRegistration | None:
    row: CompanyRegistration | None = await db.scalar(
        select(CompanyRegistration).where(CompanyRegistration.tenant_id == tenant_id)
    )
    return row


async def registration(db: AsyncSession, tenant_id: int) -> schemas.Registration | None:
    return registration_out(await _registration(db, tenant_id))


def registration_out(row: CompanyRegistration | None) -> schemas.Registration | None:
    if row is None:
        return None
    return schemas.Registration(
        entityType=row.entity_type,
        legalName=row.legal_name,
        cin=row.cin,
        pan=row.pan,
        tan=row.tan,
        epfCode=row.epf_code,
        esiCode=row.esi_code,
        ptState=row.pt_state,
        udyam=row.udyam,
        incorporatedOn=row.incorporated_on,
        registeredAddress=row.registered_address,
        website=row.website,
        email=row.email,
        phone=row.phone,
        city=row.city,
        state=row.state,
        directors=[schemas.Director(**item) for item in row.directors],
    )


def gaps(
    plan: schemas.CompliancePlan,
    registration: schemas.Registration | None,
    headcount: int,
    payroll: bool,
) -> list[schemas.ComplianceGap]:
    """What is missing from the registration details, and what the company's own records
    suggest applies. Suggestions are never switched on by themselves: a person decides."""
    out: list[schemas.ComplianceGap] = []

    def missing(text: str) -> None:
        out.append(schemas.ComplianceGap(kind="missing", text=text))

    def suggest(text: str, switch: Literal["tds", "pfEsi", "company"] | None = None) -> None:
        out.append(schemas.ComplianceGap(kind="suggestion", text=text, switch=switch))

    reg = registration or schemas.Registration()
    if registration is None:
        missing("No registration details yet: add the entity type, PAN and the rest.")
    else:
        if reg.entityType is None:
            missing("Entity type (private limited, LLP, partnership…)")
        if reg.pan is None:
            missing("PAN")
        if reg.entityType in COMPANIES and reg.cin is None:
            missing("CIN")
        if reg.entityType == "llp" and reg.cin is None:
            missing("LLPIN")
        if reg.entityType in (*COMPANIES, "llp") and not any(
            "director" in person.roles for person in reg.directors
        ):
            missing("Directors or designated partners")
    if plan.tds and reg.tan is None:
        missing("TAN: needed to deduct and deposit TDS")
    if plan.gstFiling != "none" and plan.gstin is None:
        missing("GSTIN: GST returns are set but no GSTIN is recorded")
    if plan.pfEsi and (reg.epfCode is None or reg.esiCode is None):
        missing("EPF and ESI codes: PF and ESI payments are set")
    if plan.gstin and plan.gstFiling == "none":
        suggest("A GSTIN is recorded but no GST returns are set. Choose monthly or quarterly.")
    if payroll and not plan.tds:
        suggest("Salaries are on record: TDS on salaries usually applies.", "tds")
    if headcount >= 20 and not plan.pfEsi:
        suggest(f"{headcount} people on record: EPF applies from 20 employees.", "pfEsi")
    elif headcount >= 10 and not plan.pfEsi:
        suggest(
            f"{headcount} people on record: ESI applies from 10 employees in most states.", "pfEsi"
        )
    if reg.entityType in COMPANIES and not plan.company:
        suggest(
            "A limited company files AOC-4, MGT-7, the tax return and advance tax."
            " Switch on company filings.",
            "company",
        )
    return out


async def _profile(db: AsyncSession, tenant_id: int) -> ComplianceProfile | None:
    row: ComplianceProfile | None = await db.scalar(
        select(ComplianceProfile).where(ComplianceProfile.tenant_id == tenant_id)
    )
    return row


async def compliance_view(
    db: AsyncSession, tenant_id: int, today: date
) -> tuple[schemas.CompliancePlan, list[schemas.ComplianceDue]]:
    """The filing plan, and its dues from 90 days back to 30 ahead, marked filed or not."""
    profile = await _profile(db, tenant_id)
    if profile is None:
        return schemas.CompliancePlan(), []
    registration = await _registration(db, tenant_id)
    plan = schemas.CompliancePlan(
        gstin=profile.gstin,
        gstFiling=profile.gst_filing,
        tds=profile.tds,
        pfEsi=profile.pf_esi,
        company=profile.company,
    )
    filed = await _filed(db, tenant_id)
    first, last = due_dates.window(today)
    return plan, [
        _due_out(due, filed, today)
        for due in due_dates.dues(_rules(profile, registration), first, last)
    ]


def _due_out(
    due: due_dates.Due, filed: dict[str, tuple[date, str | None]], today: date
) -> schemas.ComplianceDue:
    done = due.key in filed
    fee, note = (None, "") if done else due_dates.late_cost(due.key, due.due_on, today)
    return schemas.ComplianceDue(
        key=due.key,
        label=due.label,
        period=due.period,
        area=due.area,
        dueOn=due.due_on.isoformat(),
        status=due_dates.status(due.due_on, done, today),
        filedOn=filed[due.key][0].isoformat() if done else None,
        acknowledgement=filed[due.key][1] if done else None,
        to="/portfolio?view=compliance",
        lateFee=str(fee) if fee is not None else None,
        lateNote=note or None,
    )


async def register(
    db: AsyncSession, tenant_id: int, today: date
) -> tuple[list[schemas.ComplianceDue], date]:
    """Every filing for the company from 1 April of the previous financial year to 30 days ahead,
    filed or not: the filing register, and the full count of what is unfiled."""
    profile = await _profile(db, tenant_id)
    start = due_dates.register_start(today)
    if profile is None:
        return [], start
    registration = await _registration(db, tenant_id)
    filed = await _filed(db, tenant_id)
    dues = due_dates.dues(_rules(profile, registration), start, today + timedelta(days=30))
    return [_due_out(due, filed, today) for due in dues], start


async def _filed(db: AsyncSession, tenant_id: int) -> dict[str, tuple[date, str | None]]:
    return {
        key: (day, acknowledgement)
        for key, day, acknowledgement in (
            await db.execute(
                select(
                    ComplianceFiling.item_key,
                    ComplianceFiling.filed_on,
                    ComplianceFiling.acknowledgement,
                ).where(ComplianceFiling.tenant_id == tenant_id)
            )
        ).all()
    }


async def set_compliance_plan(
    db: AsyncSession,
    user_id: int,
    current_tenant: int,
    company_id: str,
    plan: schemas.CompliancePlan,
    ip: str,
) -> schemas.CompliancePlan:
    """Says which filings apply. The Owner or someone with money (Group finance) sets it."""
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        row = await _profile(db, tenant_id)
        if row is None:
            row = ComplianceProfile(tenant_id=tenant_id, updated_by=user_id)
            db.add(row)
        row.gstin, row.gst_filing, row.tds = plan.gstin, plan.gstFiling, plan.tds
        row.pf_esi, row.company, row.updated_by, row.updated_at = (
            plan.pfEsi,
            plan.company,
            user_id,
            now(),
        )
        record(db, "portfolio.compliance_plan_set", user_id=user_id, tenant_id=tenant_id, ip=ip)
        await db.flush()
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return plan


async def mark_filing(
    db: AsyncSession,
    user_id: int,
    current_tenant: int,
    company_id: str,
    key: str,
    filed_on: date | None,
    ip: str,
    acknowledgement: str | None = None,
) -> None:
    """Marks a filing done on a day, or (with no day) takes the mark back. The key must be one of
    the company's own dues, so nothing else can be recorded."""
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        today = today_ist()
        if filed_on is not None and filed_on > today:
            raise ApiError("invalid_date", "A filing cannot be marked done in the future.", 422)
        profile = await _profile(db, tenant_id)
        registration = await _registration(db, tenant_id)
        known = profile is not None and any(
            due.key == key
            for due in due_dates.dues(
                _rules(profile, registration),
                # The same span as the filing register, so every filing it lists can be recorded.
                due_dates.register_start(today),
                today + timedelta(days=60),
            )
        )
        if not known:
            raise ApiError("not_found", "That filing is not in this company's due dates.", 404)
        row = await db.scalar(
            select(ComplianceFiling).where(
                ComplianceFiling.tenant_id == tenant_id, ComplianceFiling.item_key == key
            )
        )
        if filed_on is None:
            if row is not None:
                await db.delete(row)
        elif row is None:
            db.add(
                ComplianceFiling(
                    tenant_id=tenant_id,
                    item_key=key,
                    filed_on=filed_on,
                    filed_by=user_id,
                    acknowledgement=acknowledgement,
                )
            )
        else:
            row.filed_on, row.filed_by, row.acknowledgement = filed_on, user_id, acknowledgement
        record(
            db,
            "portfolio.filing_marked" if filed_on else "portfolio.filing_unmarked",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"item": key},
        )
        await db.flush()
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def set_registration(
    db: AsyncSession,
    user_id: int,
    current_tenant: int,
    company_id: str,
    data: schemas.Registration,
    ip: str,
) -> schemas.Registration:
    """Saves the company's registration details. The Owner or Group finance sets them."""
    try:
        tenant_id = await enter_company(db, user_id, company_id, "portfolio:finance")
        row = await _registration(db, tenant_id)
        if row is None:
            row = CompanyRegistration(tenant_id=tenant_id, updated_by=user_id)
            db.add(row)
        row.entity_type, row.legal_name, row.cin = data.entityType, data.legalName, data.cin
        row.pan, row.tan, row.epf_code, row.esi_code = (
            data.pan,
            data.tan,
            data.epfCode,
            data.esiCode,
        )
        row.pt_state, row.udyam, row.incorporated_on = data.ptState, data.udyam, data.incorporatedOn
        row.registered_address = data.registeredAddress
        row.website, row.email, row.phone = data.website, data.email, data.phone
        row.city, row.state = data.city, data.state
        row.directors = [item.model_dump() for item in data.directors]
        row.updated_by, row.updated_at = user_id, now()
        record(db, "portfolio.registration_set", user_id=user_id, tenant_id=tenant_id, ip=ip)
        await db.flush()
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return data


def set_up(plan: schemas.CompliancePlan, registration: schemas.Registration | None) -> bool:
    """Whether any kind of filing is tracked for the company."""
    llp = registration is not None and registration.entityType == "llp"
    return plan.gstFiling != "none" or plan.tds or plan.pfEsi or plan.company or llp


async def register_all(
    db: AsyncSession, user_id: int, current_tenant: int | None
) -> list[schemas.RegisterRow]:
    """The filing register of every company this person sees, for export."""
    rows: list[schemas.RegisterRow] = []
    today = today_ist()
    try:
        for tenant_id in await readable_companies(db, user_id):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            company = await org.company(db, tenant_id)
            dues, _ = await register(db, tenant_id, today)
            rows += [
                schemas.RegisterRow(
                    companyId=str(tenant_id),
                    company=company.name if company else "",
                    key=due.key,
                    label=due.label,
                    period=due.period,
                    area=due.area,
                    dueOn=due.dueOn,
                    status=due.status,
                    filedOn=due.filedOn,
                    acknowledgement=due.acknowledgement,
                    lateFee=due.lateFee,
                    lateNote=due.lateNote,
                )
                for due in dues
            ]
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return rows
