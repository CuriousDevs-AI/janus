import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from janus_api.team.schemas import IceConfigOut

Outcome = Literal["connected", "no_answer", "busy", "voicemail", "wrong_number"]


class LogCallIn(BaseModel):
    """A phone call that already happened, logged against the contact."""

    model_config = ConfigDict(extra="forbid")
    direction: Literal["outbound", "inbound"] = "outbound"
    outcome: Outcome
    duration_seconds: int | None = Field(default=None, ge=0, le=86400)
    notes: str = Field(default="", max_length=2000)


class CallUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    outcome: Outcome | None = None
    notes: str | None = Field(default=None, max_length=2000)


class CallOut(BaseModel):
    id: str
    contactId: str
    agentId: str
    agentName: str
    method: str
    direction: str
    status: str
    outcome: str | None
    durationSeconds: int | None
    notes: str
    expiresAt: str | None
    startedAt: str | None
    endedAt: str | None
    createdAt: str


class BrowserCallOut(BaseModel):
    """A new browser call. The link is shown once; only its hash is kept."""

    call: CallOut
    link: str


class SignalIn(BaseModel):
    """A WebRTC message for the other side of the call. Kept under 64 KB."""

    model_config = ConfigDict(extra="forbid")
    kind: Literal["offer", "answer", "ice", "bye"]
    payload: dict[str, Any]

    @field_validator("payload")
    @classmethod
    def small(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value)) > 65536:
            raise ValueError("A call message can be at most 64 KB.")
        return value


class SignalOut(BaseModel):
    id: str
    kind: str
    payload: dict[str, Any]


class GuestCallOut(BaseModel):
    """What the customer sees on the call page: who is calling, and how to connect."""

    company: str
    agentName: str
    status: str
    ice: IceConfigOut
