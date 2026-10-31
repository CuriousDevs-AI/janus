import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Kind = Literal["employee", "leave", "attendance"]
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
    """A first upload of HR records that so far lived only in an HR admin's browser."""

    model_config = ConfigDict(extra="forbid")
    employee: list[dict[str, Any]] = Field(default_factory=list, max_length=5000)
    leave: list[dict[str, Any]] = Field(default_factory=list, max_length=20000)
    attendance: list[dict[str, Any]] = Field(default_factory=list, max_length=100000)


class RecordsOut(BaseModel):
    """What this person may see. `me` is their own employee record's id, matched by email."""

    me: str | None
    admin: bool
    seeded: bool
    employee: list[RecordOut]
    leave: list[RecordOut]
    attendance: list[RecordOut]
