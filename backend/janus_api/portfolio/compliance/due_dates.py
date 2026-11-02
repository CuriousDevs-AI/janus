"""The statutory calendar for an Indian company: which filings fall due, and when.

Dates are the standard due dates. Government extensions, state-wise GSTR-3B dates for quarterly
filers (the 22nd or the 24th) and a company's own AGM date can move them, so the screen says the
dates are to be confirmed with the company's CA. A filing is identified by its code and period
(gstr3b_2026-10), which is what marking it done records.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

# How far back an unfiled item still shows as overdue, and how far ahead dues are listed.
LOOK_BACK, LOOK_AHEAD, SOON = 90, 30, 7
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


@dataclass(frozen=True)
class Profile:
    gst_filing: str
    tds: bool
    pf_esi: bool
    company: bool
    # From the registration details: an LLP files Forms 11 and 8 instead of AOC-4 and MGT-7, and
    # professional tax follows the state's own calendar (Karnataka and Maharashtra so far).
    llp: bool = False
    pt_state: str | None = None


@dataclass(frozen=True)
class Due:
    key: str
    label: str
    period: str
    due_on: date
    area: str


def _month_after(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _fy(start_year: int) -> str:
    return f"FY {start_year}-{str(start_year + 1)[2:]}"


def _fy_start(day: date) -> int:
    return day.year if day.month >= 4 else day.year - 1


def _months(first: date, last: date) -> Iterator[tuple[int, int]]:
    year, month = first.year, first.month
    while (year, month) <= (last.year, last.month):
        yield year, month
        year, month = _month_after(year, month)


def dues(profile: Profile, first: date, last: date) -> list[Due]:
    """Every filing for the profile that falls due between two days, both included."""
    found: list[Due] = []
    # Monthly filings are for the month before the one they fall due in.
    for year, month in _months(first - timedelta(days=62), last + timedelta(days=31)):
        name, key = f"{MONTHS[month - 1]} {year}", f"{year}-{month:02d}"
        next_year, next_month = _month_after(year, month)
        if profile.gst_filing == "monthly":
            found.append(
                Due(f"gstr1_{key}", "GSTR-1", name, date(next_year, next_month, 11), "GST")
            )
            found.append(
                Due(f"gstr3b_{key}", "GSTR-3B", name, date(next_year, next_month, 20), "GST")
            )
        if profile.tds:
            # TDS for March is paid by 30 April; every other month by the 7th of the next.
            due = date(year, 4, 30) if month == 3 else date(next_year, next_month, 7)
            found.append(Due(f"tds_{key}", "TDS payment", name, due, "TDS"))
        if profile.pf_esi:
            found.append(
                Due(f"pf_{key}", "PF payment", name, date(next_year, next_month, 15), "Payroll")
            )
            found.append(
                Due(f"esi_{key}", "ESI payment", name, date(next_year, next_month, 15), "Payroll")
            )
        if profile.pt_state == "KA":
            found.append(
                Due(
                    f"ptka_{key}",
                    "Professional tax (Karnataka)",
                    name,
                    date(next_year, next_month, 20),
                    "Payroll",
                )
            )
        if profile.pt_state == "MH":
            # Maharashtra: by the last day of the month the salary is for.
            found.append(
                Due(
                    f"ptmh_{key}",
                    "Professional tax (Maharashtra)",
                    name,
                    date(next_year, next_month, 1) - timedelta(days=1),
                    "Payroll",
                )
            )
    for start in range(first.year - 1, last.year + 1):
        fy = _fy(start)
        # The financial year's quarters, with the month each ends in.
        quarters = [(1, start, 6), (2, start, 9), (3, start, 12), (4, start + 1, 3)]
        for number, year, end_month in quarters:
            label = f"Q{number} {fy}"
            if profile.gst_filing == "quarterly":
                filing_year, filing_month = _month_after(year, end_month)
                found.append(
                    Due(
                        f"gstr1q_{start}q{number}",
                        "GSTR-1 (quarterly)",
                        label,
                        date(filing_year, filing_month, 13),
                        "GST",
                    )
                )
                found.append(
                    Due(
                        f"gstr3bq_{start}q{number}",
                        "GSTR-3B (quarterly)",
                        label,
                        date(filing_year, filing_month, 22),
                        "GST",
                    )
                )
            if profile.tds:
                return_due = {
                    1: date(start, 7, 31),
                    2: date(start, 10, 31),
                    3: date(start + 1, 1, 31),
                    4: date(start + 1, 5, 31),
                }[number]
                found.append(
                    Due(f"tdsr_{start}q{number}", "TDS return (24Q/26Q)", label, return_due, "TDS")
                )
        if profile.gst_filing != "none":
            found.append(
                Due(
                    f"gstr9_{start - 1}",
                    "GSTR-9 (annual GST return)",
                    _fy(start - 1),
                    date(start, 12, 31),
                    "GST",
                )
            )
        if profile.llp:
            for code, label, due in (
                ("llp11", "LLP Form 11 (annual return)", date(start, 5, 30)),
                ("llp8", "LLP Form 8 (accounts and solvency)", date(start, 10, 30)),
                ("itr", "Income tax return", date(start, 10, 31)),
            ):
                found.append(Due(f"{code}_{start - 1}", label, _fy(start - 1), due, "LLP"))
        if profile.company:
            for number, due in (
                (1, date(start, 6, 15)),
                (2, date(start, 9, 15)),
                (3, date(start, 12, 15)),
                (4, date(start + 1, 3, 15)),
            ):
                found.append(
                    Due(
                        f"advtax_{start}q{number}",
                        "Advance tax instalment",
                        f"Q{number} {fy}",
                        due,
                        "Income tax",
                    )
                )
            # Filings for the year that ended on 31 March of this calendar year.
            closed = _fy(start - 1)
            for code, label, due in (
                ("dir3", "DIR-3 KYC of directors", date(start, 9, 30)),
                ("taxaudit", "Tax audit report", date(start, 9, 30)),
                ("itr", "Income tax return", date(start, 10, 31)),
                ("aoc4", "AOC-4 (financial statements)", date(start, 10, 30)),
                ("mgt7", "MGT-7 (annual return)", date(start, 11, 29)),
            ):
                found.append(Due(f"{code}_{start - 1}", label, closed, due, "Company"))
    # One of each: an LLP marked as a company too would otherwise list its tax return twice.
    unique = {due.key: due for due in found if first <= due.due_on <= last}
    return sorted(unique.values(), key=lambda due: due.due_on)


def window(today: date) -> tuple[date, date]:
    return today - timedelta(days=LOOK_BACK), today + timedelta(days=LOOK_AHEAD)


def status(
    due_on: date, filed: bool, today: date
) -> Literal["filed", "overdue", "due_soon", "upcoming"]:
    if filed:
        return "filed"
    if due_on < today:
        return "overdue"
    return "due_soon" if due_on <= today + timedelta(days=SOON) else "upcoming"
