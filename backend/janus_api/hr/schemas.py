import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Kind = Literal[
    "employee",
    "leave",
    "attendance",
    "document",
    "document_extra",
    "onboarding",
    "expense",
    "expense_evidence",
    "regularisation",
    "letter",
    "review",
    "policy_question",
    "leave_adjustment",
    "acknowledgement",
    "exit",
    "career",
    "candidate",
    "candidate_detail",
    "onboarding_note",
    "payroll_issue",
    "whatsapp",
    "signature",
    "compliance",
    "audit",
    "import",
    "filing",
    "config",
    "payroll_run",
]
Key = str


class RecordIn(BaseModel):
    """A record to save. `expected_version` is the version this copy was based on; 0 if new."""

    model_config = ConfigDict(extra="forbid")
    data: dict[str, Any]
    expected_version: int = Field(ge=0)

    @field_validator("data")
    @classmethod
    def small(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value)) > 32_000:
            raise ValueError("An HR record can be at most 32 KB.")
        return value


class RecordOut(BaseModel):
    kind: Kind
    key: str
    version: int
    data: dict[str, Any]


class BatchIn(BaseModel):
    """A first upload of HR records that so far lived only in an HR admin's browser, by kind."""

    model_config = ConfigDict(extra="forbid")
    records: dict[Kind, list[dict[str, Any]]] = Field(default_factory=dict)

    @field_validator("records")
    @classmethod
    def bounded(cls, value: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
        if sum(len(items) for items in value.values()) > 100_000:
            raise ValueError("Upload at most 100,000 HR records at once.")
        return value


class RecordsOut(BaseModel):
    """What this person may see, by kind. `me` is their own employee record's id, by email."""

    me: str | None
    admin: bool
    seeded: bool
    records: dict[str, list[RecordOut]]
