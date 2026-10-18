from datetime import datetime
from typing import Annotated, Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

SystemRole = Literal["owner", "admin", "manager", "agent"]
MemberStatus = Literal["active", "disabled"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class TenantOut(BaseModel):
    id: str
    name: str
    timezone: str
    role: str
    status: str


class BusinessHours(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def distinct_times(self) -> Self:
        if self.start == self.end:
            raise ValueError("Start and end must differ; overnight hours are allowed")
        return self


class WorkspaceOut(BaseModel):
    id: str
    name: str
    industry: str
    companySize: str
    timezone: str
    businessHours: BusinessHours
    defaultChannel: str


class WorkspaceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
        | None
    ) = None
    industry: str | None = Field(default=None, max_length=120)
    companySize: str | None = Field(default=None, max_length=80)
    timezone: str | None = None
    businessHours: BusinessHours | None = None
    defaultChannel: Literal["website_chat", "email", "whatsapp", "call"] | None = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError) as error:
                raise ValueError("Unknown timezone") from error
        return value

    @model_validator(mode="after")
    def nonempty_patch(self) -> Self:
        if not self.model_fields_set or any(
            getattr(self, key) is None for key in self.model_fields_set
        ):
            raise ValueError("Supply at least one non-null workspace field")
        return self


class InvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    role: SystemRole


class InvitationOut(BaseModel):
    tenant: str
    role: str
    inviter: str


class PendingInvitationOut(BaseModel):
    id: str
    email: str
    role: str
    inviter_id: str
    created_at: datetime
    expires_at: datetime
    last_sent_at: datetime


class InvitationReceipt(BaseModel):
    id: str
    message: str


class MembershipUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: MemberStatus | None = None
    role: SystemRole | None = None

    @model_validator(mode="after")
    def nonempty_patch(self) -> Self:
        if not self.model_fields_set or any(
            getattr(self, key) is None for key in self.model_fields_set
        ):
            raise ValueError("Supply status or role, not null")
        return self


class MemberOut(BaseModel):
    id: str
    user_id: str
    name: str
    email: str
    avatar_url: str | None
    role: str
    status: str


class RoleOut(BaseModel):
    id: str
    name: str
    permissions: list[str]


class TeamCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    description: str = Field(default="", max_length=1000)


class TeamUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    description: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def nonempty_patch(self) -> Self:
        if not self.model_fields_set or any(
            getattr(self, key) is None for key in self.model_fields_set
        ):
            raise ValueError("Supply name or description, not null")
        return self


class TeamOut(BaseModel):
    id: str
    name: str
    description: str
    member_count: int
