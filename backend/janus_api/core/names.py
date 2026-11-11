"""Names and document numbers as they are matched across modules: one party or one invoice
written two ways is still one."""

import re

# Words a company name ends with that do not change who the party is.
SUFFIXES = (
    ("private", "limited"),
    ("pvt", "ltd"),
    ("pvt", "limited"),
    ("private", "ltd"),
    ("pvt",),
    ("ltd",),
    ("limited",),
    ("llp",),
    ("opc",),
)


def party_key(name: str) -> str:
    """A customer or supplier name as it is matched: "M/s Gupta Traders Pvt. Ltd." and
    "GUPTA TRADERS" alike."""
    text = re.sub(r"^\s*m\s*/\s*s\b\.?", "", name.casefold().replace("&", " and "))
    words = re.sub(r"[^\w\s]", " ", text).split()
    trimmed = True
    while trimmed:
        trimmed = False
        for suffix in SUFFIXES:
            if len(words) > len(suffix) and tuple(words[-len(suffix) :]) == suffix:
                words = words[: -len(suffix)]
                trimmed = True
                break
    return " ".join(words) or name.strip().casefold()


def document_key(number: str) -> str:
    """An invoice or bill number as it is matched: "INV/2026/0155" and "inv-2026-0155" alike."""
    return re.sub(r"[^0-9a-z]", "", number.casefold())
