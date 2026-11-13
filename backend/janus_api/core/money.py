"""Money as people in India write it."""


def inr_exact(paise: int) -> str:
    """An exact amount in Indian grouping: 18500000 paise as ₹1,85,000 and 50 paise as ₹0.50."""
    sign = "−" if paise < 0 else ""
    whole, part = divmod(abs(paise), 100)
    digits = str(whole)
    head, tail = digits[:-3], digits[-3:]
    groups = [head[max(0, end - 2) : end] for end in range(len(head), 0, -2)][::-1]
    grouped = ",".join([*groups, tail]) if head else tail
    return f"{sign}₹{grouped}" + (f".{part:02d}" if part else "")
