"""The periods the Portfolio reports on, and rupee amounts as the API sends them."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from janus_api.portfolio import schemas

MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def today_ist() -> date:
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def _months_back(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 - months
    return date(index // 12, index % 12 + 1, 1)


def period_for(key: str, today: date) -> schemas.Period:
    """The period to date, and the same number of days at the start of the period before it.

    Quarters and years follow the Indian financial year, which starts on 1 April. Comparing to date
    against the same days before keeps a half-finished month from looking like a fall.
    """
    if key == "week":
        # The seven days ending today, against the seven before: what the weekly digest reports.
        start = today - timedelta(days=6)
        before = start - timedelta(days=7)
        label = "Last 7 days"
    elif key == "fy":
        start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
        before = date(start.year - 1, 4, 1)
        label = f"FY {start.year}-{str(start.year + 1)[2:]}"
    elif key == "quarter":
        start = date(today.year, (today.month - 1) // 3 * 3 + 1, 1)
        before = _months_back(start, 3)
        quarter = (start.month - 4) % 12 // 3 + 1
        label = f"Q{quarter} ({MONTHS[start.month - 1]}-{MONTHS[(start.month + 1) % 12]})"
    else:
        start = today.replace(day=1)
        before = _months_back(start, 1)
        label = f"{MONTHS[start.month - 1]} {start.year}"
    elapsed = (today - start).days + 1
    return schemas.Period(
        key=key,
        label=label,
        start=start.isoformat(),
        end=today.isoformat(),
        previousStart=before.isoformat(),
        # Inclusive, like end: the same count of days into the period before, never past its end.
        previousEnd=(min(before + timedelta(days=elapsed), start) - timedelta(days=1)).isoformat(),
    )


def rupees(value: Decimal | int, *, paise: bool = False) -> str:
    """An amount as a rupee string with two decimals: 1250 paise as "12.50"."""
    amount = Decimal(value) / 100 if paise else Decimal(value)
    return str(amount.quantize(Decimal("0.01")))
