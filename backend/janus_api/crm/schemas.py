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
    field_validator,
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
    # Set to true after the user has seen and dismissed the duplicate warning.
    skipDuplicateCheck: bool = False

    @field_validator("phone", "email", mode="before")
    @classmethod
    def blank_is_none(cls, value: object) -> object:
        # Forms send "" for a field left empty; that means no phone or no email, not a bad one.
        return None if isinstance(value, str) and not value.strip() else value


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
    nextFollowUpOn: date | None = None
    lostCategory: str | None = None
    lostReason: str = ""
    lostAt: datetime | None = None


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


LostCategory = Literal[
    "price", "competitor", "no_budget", "no_response", "timing", "not_a_fit", "other"
]
LostNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


def check_lost(
    stage: str, category: "LostCategory | None", note: str
) -> tuple["LostCategory | None", str]:
    """A lost lead or deal needs a reason; "other" needs a note. Anything else carries neither."""
    if stage != "lost":
        return None, ""
    if category is None and note:
        category = "other"  # A reason typed without choosing one, as older clients send.
    if category is None:
        raise ValueError("Choose why it was lost.")
    if category == "other" and not note:
        raise ValueError("Say why it was lost.")
    return category, note


class LeadUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="", max_length=160)
    phone: str | None = Field(default=None, max_length=64)
    email: EmailStr | None = None
    company: str = Field(default="", max_length=200)
    requirement: str = Field(default="", max_length=4000)
    stage: LeadStage = "new"
    lostCategory: LostCategory | None = None
    lostReason: LostNote = ""

    @model_validator(mode="after")
    def loss_reason(self) -> "LeadUpdate":
        self.lostCategory, self.lostReason = check_lost(
            self.stage, self.lostCategory, self.lostReason
        )
        return self


DealStage = Literal[
    "new", "qualified", "demo", "proposal", "negotiation", "approval", "won", "lost"
]


class DealValues(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2, allow_inf_nan=False)
    stage: DealStage = "new"
    expectedCloseAt: date | None = None
    lostCategory: LostCategory | None = None
    lostReason: LostNote = ""

    @model_validator(mode="after")
    def loss_reason(self) -> "DealValues":
        self.lostCategory, self.lostReason = check_lost(
            self.stage, self.lostCategory, self.lostReason
        )
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
    lostCategory: LostCategory | None = None
    lostReason: str
    lostAt: datetime | None = None
    version: int
    createdAt: datetime
    updatedAt: datetime


class DealEvent(BaseModel):
    id: str
    action: str
    userId: str | None
    userName: str | None = None
    details: dict[str, str | int | bool]
    createdAt: datetime


class NoteIn(BaseModel):
    """A follow-up: what happened, and when to follow up next (empty for no date)."""

    model_config = ConfigDict(extra="forbid")

    body: str = Field(min_length=2, max_length=2000)
    nextFollowUpOn: date | None = None


class NoteOut(BaseModel):
    id: str
    body: str
    author: str | None
    nextFollowUpOn: date | None
    createdAt: datetime


class AssignIn(BaseModel):
    """Hands leads to one person, or to nobody with ownerId null. Up to 100 at a time."""

    model_config = ConfigDict(extra="forbid")

    leadIds: list[str] = Field(min_length=1, max_length=100)
    ownerId: str | None = None


class AssignOut(BaseModel):
    assigned: int
    ownerName: str | None


class LostReasonOut(BaseModel):
    category: str
    label: str
    count: int
    value: str


class CustomerListRow(BaseModel):
    """A customer in the paged customer list: contact info plus lead/deal summaries."""

    contactId: str
    name: str
    phone: str | None
    email: str | None
    company: str
    leadCount: int
    dealValue: str
    stage: str
    ownerId: str | None
    ownerName: str | None
    lastActivityAt: datetime | None


class AccountInvoiceOut(BaseModel):
    id: str
    number: str
    invoiceDate: date
    dueDate: date
    total: str
    due: str


class CustomerAccountOut(BaseModel):
    """A customer's invoices, payments and dues. Amounts only where `full` (a role with money);
    otherwise how many invoices there are and how many are overdue."""

    full: bool
    invoices: int
    overdueInvoices: int = 0
    oldestOverdueDays: int = 0
    invoiced: str | None = None
    paid: str | None = None
    credited: str | None = None
    due: str | None = None
    overdue: str | None = None
    lastInvoiceOn: date | None = None
    latest: list[AccountInvoiceOut] = []
