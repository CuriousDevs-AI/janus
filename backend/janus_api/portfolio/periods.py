"""The periods the Portfolio reports on, and rupee amounts as the API sends them."""

from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
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


def inr(value: str | Decimal | int | None) -> str:
    """Rupees the way the Portfolio page writes them: ₹12,500, ₹4.2L, ₹1.3Cr."""
    amount = Decimal(value or 0)
    # A loss reads −₹3L, never ₹-3L.
    if amount < 0 and inr(-amount) != "₹0":
        return f"−{inr(-amount)}"
    for size, unit in ((Decimal(10**7), "Cr"), (Decimal(10**5), "L")):
        if abs(amount) >= size:
            return f"₹{(amount / size).quantize(Decimal('0.1'), ROUND_HALF_UP).normalize():f}{unit}"
    whole = int(amount.quantize(Decimal(1), ROUND_HALF_UP))
    digits = str(abs(whole))
    head, tail = digits[:-3], digits[-3:]
    groups = [head[max(0, end - 2) : end] for end in range(len(head), 0, -2)][::-1]
    return f"₹{'-' if whole < 0 else ''}{','.join([*groups, tail]) if head else tail}"
