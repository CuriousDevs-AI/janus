from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    HttpUrl,
    StringConstraints,
    model_validator,
)


class CapturedContact(BaseModel):
    name: str = Field(default="", max_length=160)
    phone: str | None = Field(default=None, max_length=64)
    email: EmailStr | None = None
    company: str = Field(default="", max_length=200)
    requirement: str = Field(default="", max_length=4000)
    campaign: str | None = Field(default=None, max_length=200)
    recording_reference: str | None = Field(default=None, max_length=2048)
    recording_url: HttpUrl | None = Field(default=None, max_length=2048)


class ManualLeadIn(BaseModel):
    """An enquiry a person typed in: at least a phone number or an email is needed to reach them."""

    name: str = Field(default="", max_length=160)
    phone: str | None = Field(default=None, max_length=64)
    email: EmailStr | None = None
    company: str = Field(default="", max_length=200)
    requirement: str = Field(default="", max_length=4000)


class ContactOut(BaseModel):
    id: str
    name: str
    phone: str | None
    email: str | None
    company: str
    whatsappOptIn: bool
    doNotContact: bool
    consentSource: str | None
    consentUpdatedAt: datetime | None


class ContactUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="", max_length=160)
    phone: str | None = Field(default=None, max_length=64)
    email: EmailStr | None = None
    company: str = Field(default="", max_length=200)


class ContactConsentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    whatsappOptIn: bool = False
    doNotContact: bool = False
    consentSource: str | None = Field(default=None, max_length=80)


LeadSource = Literal[
    "website",
    "whatsapp",
    "phone_call",
    "webhook",
    "api",
    "csv_import",
    "meta_lead_ads",
    "indiamart",
    "manual",
    "referral",
]


class LeadOut(BaseModel):
    dealId: str | None = None
    id: str
    customerId: str
    contactName: str
    phone: str | None
    email: str | None
    company: str
    whatsappOptIn: bool
    doNotContact: bool
    consentSource: str | None
    consentUpdatedAt: datetime | None
    source: LeadSource
    stage: str
    ownerId: str | None
    ownerName: str | None
    requirement: str
    campaign: str | None
    recordingReference: str | None
    recordingUrl: str | None
    createdAt: datetime
    lastActivityAt: datetime


LeadStage = Literal[
    "new",
    "contacted",
    "qualified",
    "demo",
    "proposal",
    "negotiation",
    "approval",
    "won",
    "lost",
]


class LeadUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="", max_length=160)
    phone: str | None = Field(default=None, max_length=64)
    email: EmailStr | None = None
    company: str = Field(default="", max_length=200)
    requirement: str = Field(default="", max_length=4000)
    stage: LeadStage = "new"


DealStage = Literal[
    "new", "qualified", "demo", "proposal", "negotiation", "approval", "won", "lost"
]


class DealValues(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2, allow_inf_nan=False)
    stage: DealStage = "new"
    expectedCloseAt: date | None = None
    lostReason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""

    @model_validator(mode="after")
    def loss_reason(self) -> "DealValues":
        if self.stage == "lost" and not self.lostReason:
            raise ValueError("Enter a reason for the lost deal.")
        if self.stage != "lost":
            self.lostReason = ""
        return self


class DealUpdate(DealValues):
    version: int = Field(ge=1, le=2**31 - 1)


class DealOut(BaseModel):
    id: str
    leadId: str
    customerId: str
    customerName: str
    company: str
    phone: str | None
    ownerId: str | None
    ownerName: str | None
    name: str
    amount: str
    stage: DealStage
    expectedCloseAt: date | None
    lostReason: str
    version: int
    createdAt: datetime
    updatedAt: datetime


class DealEvent(BaseModel):
    id: str
    action: str
    userId: str | None
    details: dict[str, str | int | bool]
    createdAt: datetime
