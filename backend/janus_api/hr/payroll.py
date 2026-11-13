"""The monthly payroll run: each person's pay for the days worked and the deductions India's rules
make from it, kept as payslips so later months know what was paid and deducted.

Rules for FY 2025-26 (as lib/hr-statutory.ts): pay is split 50% basic, 20% house rent allowance
and the rest special allowance; provident fund is 12% of basic up to ₹15,000; ESI 0.75% while
gross is ₹21,000 or less; professional tax by the branch's state (Karnataka, Maharashtra); income
tax under the new regime with the ₹75,000 standard deduction, the section 87A rebate up to ₹12
lakh with marginal relief, and 4% cess.

TDS is worked out the way an employer does it: the year's pay is projected (what was paid in
earlier months of the financial year, this month, and the current salary for the months left),
the year's tax on it is found, the TDS already deducted is taken off, and the rest is spread over
the months left. Earlier months of the year with no run in Janus count at the pay then in force,
with their share of the tax taken as deducted, and the payslip says so. Someone on the old regime
is not calculated: their TDS is left for the accountant, and the payslip says that too.
"""

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.hr.models import HrPayslip, HrRecord

PF_RATE = Decimal("0.12")
PF_WAGE_CEILING = 15000
ESI_RATE = Decimal("0.0075")
ESI_GROSS_LIMIT = 21000
STANDARD_DEDUCTION = 75000
REBATE_LIMIT = 1200000
CESS = Decimal("0.04")
SLABS = (
    (400000, Decimal(0)),
    (800000, Decimal("0.05")),
    (1200000, Decimal("0.10")),
    (1600000, Decimal("0.15")),
    (2000000, Decimal("0.20")),
    (2400000, Decimal("0.25")),
    (None, Decimal("0.30")),
)


def _round(value: Decimal | float) -> int:
    """Whole rupees, half up, as payslips show them."""
    return int(Decimal(str(value)).quantize(Decimal(1), rounding="ROUND_HALF_UP"))


def provident_fund(basic: int) -> int:
    return _round(min(basic, PF_WAGE_CEILING) * PF_RATE)


def esi(gross: int) -> int:
    return math.ceil(gross * ESI_RATE) if 0 < gross <= ESI_GROSS_LIMIT else 0


def professional_tax(branch: str, gross: int, month: date) -> int:
    """Charged by the state, so it follows the branch; states without one charge nothing."""
    place = branch.lower()
    if any(city in place for city in ("bengaluru", "bangalore", "mysuru", "mangaluru", "hubballi")):
        return 200 if gross >= 25000 else 0
    if any(city in place for city in ("pune", "mumbai", "nagpur")):
        if gross > 10000:
            return 300 if month.month == 2 else 200
        return 175 if gross > 7500 else 0
    return 0


def annual_income_tax(annual_gross: int) -> int:
    """The year's income tax under the new regime, in rupees."""
    taxable = max(0, annual_gross - STANDARD_DEDUCTION)
    tax, start = Decimal(0), 0
    for limit, rate in SLABS:
        top = taxable if limit is None else min(taxable, limit)
        if top > start:
            tax += (top - start) * rate
        if limit is None or taxable <= limit:
            break
        start = limit
    # Up to ₹12 lakh there is no tax; just above it the tax cannot exceed the income over the limit.
    tax = Decimal(0) if taxable <= REBATE_LIMIT else min(tax, Decimal(taxable - REBATE_LIMIT))
    return _round(tax * (1 + CESS))


def fy_start(month: date) -> date:
    return date(month.year if month.month >= 4 else month.year - 1, 4, 1)


def _next(month: date) -> date:
    return (month.replace(day=28) + timedelta(days=4)).replace(day=1)


def _last_day(month: date) -> date:
    return _next(month) - timedelta(days=1)


@dataclass
class Person:
    key: str
    name: str
    branch: str
    pan: str | None
    regime: str
    joined: date | None
    left: date | None
    salary_now: int
    history: list[tuple[date, int]] = field(default_factory=list)

    def salary_for(self, month: date) -> int:
        """The monthly pay in force for a month, from the revision history where there is one."""
        if not self.history:
            return self.salary_now
        applicable = [pay for start, pay in self.history if start <= month]
        return applicable[-1] if applicable else self.history[0][1]

    def days(self, month: date) -> tuple[int, int]:
        """(days paid, days in the month) for the days between joining and leaving."""
        last = _last_day(month)
        start = max(month, self.joined) if self.joined else month
        end = min(last, self.left) if self.left else last
        return max(0, (end - start).days + 1), last.day

    def pay(self, month: date) -> int:
        paid, total = self.days(month)
        return _round(Decimal(self.salary_for(month)) * paid / total) if paid else 0


@dataclass(frozen=True)
class Slip:
    person: Person
    month: date
    paid_days: int
    total_days: int
    basic: int
    hra: int
    special: int
    pf: int
    esi: int
    pt: int
    tds: int | None
    note: str

    @property
    def gross(self) -> int:
        return self.basic + self.hra + self.special

    @property
    def net(self) -> int:
        return self.gross - self.pf - self.esi - self.pt - (self.tds or 0)


def _date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


async def people(db: AsyncSession, tenant_id: int) -> list[Person]:
    """Everyone on the payroll, from HR's employee records and the exits HR has recorded."""
    rows = (
        await db.scalars(
            select(HrRecord).where(
                HrRecord.tenant_id == tenant_id, HrRecord.kind.in_(("employee", "exit"))
            )
        )
    ).all()
    left: dict[str, date] = {}
    for row in rows:
        if row.kind == "exit" and row.data.get("status") not in ("cancelled", "withdrawn"):
            day = _date(row.data.get("lastWorkingDay"))
            if day:
                left[str(row.data.get("employeeId") or row.subject)] = day
    out = []
    for row in rows:
        data = row.data
        if row.kind != "employee":
            continue
        key = str(data.get("id") or row.key)
        salary = int(Decimal(str(data.get("salaryMonthly") or 0)))
        if data.get("status") == "archived" and key not in left:
            continue
        history = sorted(
            (start, int(Decimal(str(item.get("salaryMonthly") or 0))))
            for item in data.get("salaryHistory") or []
            if isinstance(item, dict) and (start := _date(item.get("from")))
        )
        out.append(
            Person(
                key=key,
                name=str(data.get("name") or key),
                branch=str(data.get("branch") or data.get("location") or ""),
                pan=str(data["pan"]).upper() if data.get("pan") else None,
                regime="old" if str(data.get("taxRegime") or "").lower() == "old" else "new",
                joined=_date(data.get("joiningDate")),
                left=left.get(key),
                salary_now=salary,
                history=history,
            )
        )
    return sorted(out, key=lambda person: person.name.casefold())


def slip(person: Person, month: date, earlier: dict[date, tuple[int, int]]) -> Slip | None:
    """One person's payslip for a month. `earlier` holds (gross, TDS) of their payslips already
    run in this financial year, by month."""
    paid, total = person.days(month)
    fixed = person.pay(month)
    if not paid or fixed <= 0:
        return None
    basic, hra = _round(Decimal(fixed) * Decimal("0.5")), _round(Decimal(fixed) * Decimal("0.2"))
    special = fixed - basic - hra
    gross = fixed
    tds: int | None = None
    notes: list[str] = []
    if person.regime == "old":
        notes.append("Old tax regime: TDS is left for your accountant to work out.")
    else:
        start = fy_start(month)
        before: list[tuple[int, int | None]] = []
        cursor = start
        while cursor < month:
            if cursor in earlier:
                before.append(earlier[cursor])
            elif (pay := person.pay(cursor)) > 0:
                before.append((pay, None))
            cursor = _next(cursor)
        after: list[int] = []
        cursor = _next(month)
        while cursor < date(start.year + 1, 4, 1):
            if (pay := person.pay(cursor)) > 0:
                after.append(pay)
            cursor = _next(cursor)
        projected = sum(g for g, _ in before) + gross + sum(after)
        year_tax = annual_income_tax(projected)
        unrun = [g for g, t in before if t is None]
        assumed = sum(_round(Decimal(year_tax) * g / projected) for g in unrun) if projected else 0
        deducted = sum(t for _, t in before if t is not None) + assumed
        tds = max(0, _round(Decimal(year_tax - deducted) / (1 + len(after))))
        if unrun and year_tax:
            notes.append(
                f"{len(unrun)} earlier month{'' if len(unrun) == 1 else 's'} of this year had no "
                "payroll run in Janus; their share of the tax is taken as already deducted."
            )
    return Slip(
        person=person,
        month=month,
        paid_days=paid,
        total_days=total,
        basic=basic,
        hra=hra,
        special=special,
        pf=provident_fund(basic),
        esi=esi(gross),
        pt=professional_tax(person.branch, gross, month),
        tds=tds,
        note=" ".join(notes),
    )


async def _earlier(
    db: AsyncSession, tenant_id: int, month: date
) -> dict[str, dict[date, tuple[int, int]]]:
    rows = (
        await db.scalars(
            select(HrPayslip).where(
                HrPayslip.tenant_id == tenant_id,
                HrPayslip.month >= fy_start(month),
                HrPayslip.month < month,
            )
        )
    ).all()
    out: dict[str, dict[date, tuple[int, int]]] = {}
    for row in rows:
        out.setdefault(row.employee_key, {})[row.month] = (
            row.gross_paise // 100,
            (row.tds_paise or 0) // 100,
        )
    return out


async def stored(db: AsyncSession, tenant_id: int, month: date) -> list[HrPayslip]:
    return list(
        (
            await db.scalars(
                select(HrPayslip)
                .where(HrPayslip.tenant_id == tenant_id, HrPayslip.month == month)
                .order_by(HrPayslip.name)
            )
        ).all()
    )


async def preview(db: AsyncSession, tenant_id: int, month: date) -> list[Slip]:
    """The month's payslips as they would be run now, without keeping them."""
    earlier = await _earlier(db, tenant_id, month)
    slips = [
        slip(person, month, earlier.get(person.key, {})) for person in await people(db, tenant_id)
    ]
    return [item for item in slips if item is not None]


async def run(db: AsyncSession, tenant_id: int, month: date, user_id: int) -> list[HrPayslip]:
    """Keeps the month's payslips. A month is run once: asking again returns the same payslips."""
    kept = await stored(db, tenant_id, month)
    if kept:
        return kept
    for item in await preview(db, tenant_id, month):
        db.add(
            HrPayslip(
                tenant_id=tenant_id,
                month=month,
                employee_key=item.person.key,
                name=item.person.name,
                pan=item.person.pan,
                paid_days=item.paid_days,
                total_days=item.total_days,
                basic_paise=item.basic * 100,
                hra_paise=item.hra * 100,
                special_paise=item.special * 100,
                gross_paise=item.gross * 100,
                pf_paise=item.pf * 100,
                esi_paise=item.esi * 100,
                pt_paise=item.pt * 100,
                tds_paise=None if item.tds is None else item.tds * 100,
                net_paise=item.net * 100,
                note=item.note or None,
                run_by=user_id,
            )
        )
    await db.flush()
    return await stored(db, tenant_id, month)


@dataclass(frozen=True)
class Line:
    """A payslip as other modules see it, in whole rupees."""

    key: str
    name: str
    paid_days: int
    total_days: int
    gross: int
    pf: int
    esi: int
    pt: int
    tds: int | None
    net: int
    note: str


def line_of(item: Slip | HrPayslip) -> Line:
    if isinstance(item, Slip):
        return Line(
            key=item.person.key,
            name=item.person.name,
            paid_days=item.paid_days,
            total_days=item.total_days,
            gross=item.gross,
            pf=item.pf,
            esi=item.esi,
            pt=item.pt,
            tds=item.tds,
            net=item.net,
            note=item.note,
        )
    return Line(
        key=item.employee_key,
        name=item.name,
        paid_days=item.paid_days,
        total_days=item.total_days,
        gross=item.gross_paise // 100,
        pf=item.pf_paise // 100,
        esi=item.esi_paise // 100,
        pt=item.pt_paise // 100,
        tds=None if item.tds_paise is None else item.tds_paise // 100,
        net=item.net_paise // 100,
        note=item.note or "",
    )
