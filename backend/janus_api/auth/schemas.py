from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AfterValidator,
    BaseModel,
    EmailStr,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
)

from janus_api.core.security import validate_password
from janus_api.org.schemas import TenantOut

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
BusinessName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
]

Password = Annotated[str, AfterValidator(validate_password)]
Token = Annotated[str, Field(min_length=20, max_length=512)]
Identifier = Annotated[int, Field(gt=0, le=2**63 - 1)]


class Signup(BaseModel):
    name: Name
    email: EmailStr
    password: Password
    business_name: BusinessName


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailRequest(BaseModel):
    email: EmailStr


class TokenRequest(BaseModel):
    token: Token


class Refresh(BaseModel):
    refresh_token: Token


class ResetPassword(TokenRequest):
    new_password: Password


class ChangePassword(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: Password


class ChangeEmail(BaseModel):
    new_email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class DeleteAccount(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class SwitchTenant(BaseModel):
    tenant_id: Identifier


class AcceptInvitation(BaseModel):
    name: Name | None = None
    password: Password | None = None


class ProfileUpdate(BaseModel):
    name: Name | None = None
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9 ()-]{7,32}$")
    avatar_url: HttpUrl | None = None
    timezone: str | None = None
    language: str | None = Field(default=None, pattern=r"^[a-z]{2,3}(-[A-Za-z]{2,4})?$")

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError) as error:
                raise ValueError("Unknown timezone") from error
        return value


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    avatar_url: str | None
    timezone: str
    language: str
    email_verified_at: datetime | None


class Me(BaseModel):
    user: UserOut
    tenant: TenantOut
    role: str
    permissions: list[str]
    tenants: list[TenantOut]


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 900


class SessionOut(BaseModel):
    id: str
    tenant_id: str
    device: str
    ip: str
    last_used_at: datetime
    created_at: datetime
    current: bool


class Message(BaseModel):
    message: str
