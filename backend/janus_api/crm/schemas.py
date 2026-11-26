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

# ---------------------------------------------------------------------------
# CRM Workspaces
# ---------------------------------------------------------------------------


class CrmBrief(BaseModel):
    id: str
    name: str
    slug: str
    isDefault: bool = False


class CrmWorkspaceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=1000)
    pipelineStages: list[dict[str, object]] | None = None


class CrmWorkspaceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    pipelineStages: list[dict[str, object]] | None = None
    winStage: str | None = Field(default=None, max_length=40)


class CrmWorkspaceOut(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    pipelineStages: list[dict[str, object]]
    winStage: str
    isDefault: bool
    active: bool
    leadCount: int = 0
    dealCount: int = 0
    memberCount: int = 0
    createdByName: str | None = None
    createdAt: datetime
    updatedAt: datetime


class CrmMemberIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    membershipId: str
    role: str | None = "member"


class CrmMemberUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str


class CrmMemberOut(BaseModel):
    id: str
    crmId: str
    membershipId: str
    memberName: str | None = None
    role: str
    createdAt: datetime


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
    crmId: str | None = None
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
    "converted",
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


DealStage = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=40,
        pattern=r"^[a-z][a-z0-9_-]{0,39}$",
    ),
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
    crmId: str | None = None
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


class LeadEvent(BaseModel):
    id: str
    action: str
    userId: str | None
    userName: str | None = None
    details: dict[str, str | int | bool]
    createdAt: datetime


class NoteIn(BaseModel):
    """A follow-up: what happened, and when to follow up next (empty for no date)."""

    model_config = ConfigDict(extra="forbid")

    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=2000)]
    nextFollowUpOn: date | None = None


class NoteOut(BaseModel):
    id: str
    body: str
    author: str | None
    nextFollowUpOn: date | None
    createdAt: datetime


class CustomerNoteIn(BaseModel):
    """A note on a customer record."""

    model_config = ConfigDict(extra="forbid")

    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=4000)]


class CustomerNoteOut(BaseModel):
    id: str
    body: str
    author: str | None
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
    dealCount: int
    dealValue: str
    dealStage: str | None
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


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------

ActivityKind = Literal["call", "meeting", "email", "task", "note"]
ActivityOutcome = Literal[
    "connected",
    "no_answer",
    "left_voicemail",
    "interested",
    "not_interested",
    "follow_up",
    "completed",
    "cancelled",
]


class ActivityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: ActivityKind
    subject: str = Field(max_length=500)
    description: str = Field(default="", max_length=5000)
    leadId: str | None = None
    dealId: str | None = None
    contactId: str
    dueAt: datetime | None = None
    outcome: ActivityOutcome | None = None
    durationSeconds: int | None = Field(default=None, ge=0, le=86400)


class ActivityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    dueAt: datetime | None = None
    outcome: ActivityOutcome | None = None
    durationSeconds: int | None = Field(default=None, ge=0, le=86400)


class ActivityCompleteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    outcome: ActivityOutcome | None = None
    durationSeconds: int | None = Field(default=None, ge=0, le=86400)


class ActivityOut(BaseModel):
    id: str
    kind: str
    subject: str
    description: str
    leadId: str | None
    leadName: str | None = None
    dealId: str | None = None
    contactId: str
    contactName: str | None = None
    ownerId: str | None
    ownerName: str | None = None
    dueAt: datetime | None
    completedAt: datetime | None
    outcome: str | None
    durationSeconds: int | None
    createdAt: datetime


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


class TagIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#6b7280", pattern=r"^#[0-9a-fA-F]{6}$")


class TagOut(BaseModel):
    id: str
    name: str
    color: str


class TagAttach(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tagId: str


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------


class ProductIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    sku: str | None = Field(default=None, max_length=50)
    description: str = Field(default="", max_length=5000)
    unitPrice: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    unit: str = Field(default="unit", max_length=20)
    taxPct: Decimal = Field(default=Decimal(18), ge=0, le=100, max_digits=5, decimal_places=2)


class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=200)
    sku: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=5000)
    unitPrice: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    unit: str | None = Field(default=None, max_length=20)
    taxPct: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    active: bool | None = None


class ProductOut(BaseModel):
    id: str
    name: str
    sku: str | None
    description: str
    unitPrice: str
    unit: str
    taxPct: str
    active: bool
    createdAt: datetime


# ---------------------------------------------------------------------------
# Deal items
# ---------------------------------------------------------------------------


class DealItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    productId: str | None = None
    description: str = Field(default="", max_length=500)
    quantity: Decimal = Field(default=Decimal(1), gt=0, max_digits=10, decimal_places=2)
    unitPrice: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    discountPct: Decimal = Field(default=Decimal(0), ge=0, le=100, max_digits=5, decimal_places=2)


class DealItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str | None = Field(default=None, max_length=500)
    quantity: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    unitPrice: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    discountPct: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)


class DealItemOut(BaseModel):
    id: str
    productId: str | None
    productName: str | None = None
    description: str
    quantity: str
    unitPrice: str
    discountPct: str
    lineTotal: str
    createdAt: datetime


# ---------------------------------------------------------------------------
# Quotes
# ---------------------------------------------------------------------------

QuoteStatus = Literal["draft", "sent", "accepted", "rejected", "expired"]


class QuoteStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: QuoteStatus


class QuoteCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    validUntil: date | None = None
    notes: str = Field(default="", max_length=5000)


class QuoteItemOut(BaseModel):
    id: str
    description: str
    quantity: str
    unitPrice: str
    discountPct: str
    taxPct: str
    lineTotal: str


class QuoteOut(BaseModel):
    id: str
    dealId: str
    number: str
    status: str
    validUntil: date | None
    notes: str
    total: str
    createdBy: str | None
    createdByName: str | None = None
    items: list[QuoteItemOut] = []
    createdAt: datetime


# ---------------------------------------------------------------------------
# Bulk operations
# ---------------------------------------------------------------------------


class BulkStageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    leadIds: list[str] = Field(min_length=1, max_length=100)
    stage: LeadStage
    lostCategory: LostCategory | None = None
    lostReason: LostNote = ""

    @model_validator(mode="after")
    def loss_reason(self) -> "BulkStageIn":
        self.lostCategory, self.lostReason = check_lost(
            self.stage, self.lostCategory, self.lostReason
        )
        return self


class BulkDeleteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    leadIds: list[str] = Field(min_length=1, max_length=100)


class ContactBulkStageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contactIds: list[str] = Field(min_length=1, max_length=100)
    stage: LeadStage
    lostCategory: LostCategory | None = None
    lostReason: LostNote = ""

    @model_validator(mode="after")
    def loss_reason(self) -> "ContactBulkStageIn":
        self.lostCategory, self.lostReason = check_lost(
            self.stage, self.lostCategory, self.lostReason
        )
        return self


class ContactBulkAssignIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contactIds: list[str] = Field(min_length=1, max_length=100)
    ownerId: str | None = None


class BulkResult(BaseModel):
    affected: int


class JourneyEvent(BaseModel):
    id: str
    action: str
    title: str
    detail: str
    userId: str | None
    userName: str | None = None
    createdAt: datetime


# ---------------------------------------------------------------------------
# Lead detail (360 view)
# ---------------------------------------------------------------------------


class LeadDetailOut(BaseModel):
    lead: LeadOut
    deal: DealOut | None = None
    notes: list[NoteOut] = []
    activities: list[ActivityOut] = []
    tags: list[TagOut] = []


# ---------------------------------------------------------------------------
# Contact detail (360 view)
# ---------------------------------------------------------------------------


class ContactLeadSummary(BaseModel):
    id: str
    crmId: str | None = None
    stage: str
    source: str
    requirement: str
    createdAt: datetime
    dealId: str | None = None
    dealName: str | None = None
    dealAmount: str | None = None
    dealStage: str | None = None


class LeadNoteWithLead(BaseModel):
    id: str
    leadId: str
    body: str
    author: str | None
    nextFollowUpOn: date | None
    createdAt: datetime


class ContactDetailOut(BaseModel):
    contact: ContactOut
    leads: list[ContactLeadSummary] = []
    notes: list[CustomerNoteOut] = []
    activities: list[ActivityOut] = []
    leadNotes: list[LeadNoteWithLead] = []
    tags: list[TagOut] = []
    totalDealValue: str = "0.00"
    openDealValue: str = "0.00"


# ---------------------------------------------------------------------------
# Dashboard & Reports
# ---------------------------------------------------------------------------


class DashboardStats(BaseModel):
    totalLeads: int
    newLeadsToday: int
    newLeadsWeek: int
    openDeals: int
    pipelineValue: str
    wonValue: str
    wonDeals: int
    lostDeals: int
    conversionRate: str
    avgCycleDays: str | None


class FunnelData(BaseModel):
    stage: str
    count: int
    value: str


class RepPerformance(BaseModel):
    ownerId: str | None
    name: str
    leads: int
    wonDeals: int
    wonValue: str
    openLeads: int
    conversionRate: str


_SOURCE_LABELS: dict[str, str] = {
    "website": "Website",
    "whatsapp": "WhatsApp",
    "phone_call": "Phone Call",
    "webhook": "Webhook",
    "api": "API",
    "csv_import": "CSV Import",
    "meta_lead_ads": "Meta Lead Ads",
    "indiamart": "IndiaMart",
    "manual": "Manual",
    "referral": "Referral",
}


class SourceBreakdown(BaseModel):
    source: str
    sourceLabel: str = ""
    leads: int
    won: int
    wonValue: str
    conversionRate: str


class DailyPoint(BaseModel):
    date: str
    leads: int
    wonDeals: int
    wonValue: str


# ---------------------------------------------------------------------------
# Contacts list
# ---------------------------------------------------------------------------


class ContactListRow(BaseModel):
    id: str
    name: str
    phone: str | None
    email: str | None
    company: str
    whatsappOptIn: bool
    doNotContact: bool
    createdAt: datetime
    tags: list["TagOut"] = []


# ---------------------------------------------------------------------------
# Lead scoring
# ---------------------------------------------------------------------------


class LeadScoreOut(BaseModel):
    leadId: str
    score: int
    factors: dict[str, int | float]
    calculatedAt: datetime


class BulkScoreResult(BaseModel):
    scored: int


# ---------------------------------------------------------------------------
# Sales targets & forecasting
# ---------------------------------------------------------------------------


class TargetIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ownerId: str | None = None
    period: str = Field(pattern=r"^\d{4}-\d{2}$")
    targetAmount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class TargetOut(BaseModel):
    id: str
    ownerId: str | None
    ownerName: str | None = None
    period: str
    targetAmount: str
    createdAt: datetime


class StageBreakdownItem(BaseModel):
    stage: str
    count: int
    value: str
    weight: float
    weightedValue: str


class ForecastOut(BaseModel):
    period: str
    targetAmount: str
    weightedPipeline: str
    wonToDate: str
    gap: str
    stageBreakdown: list[StageBreakdownItem] = []


class RepAttainmentOut(BaseModel):
    ownerId: str | None
    name: str
    targetAmount: str
    wonAmount: str
    attainmentPct: str
    weightedPipeline: str


# ---------------------------------------------------------------------------
# Custom fields
# ---------------------------------------------------------------------------

CustomFieldEntityType = Literal["lead", "contact", "deal"]
CustomFieldType = Literal[
    "text", "number", "date", "select", "multiselect", "email", "phone", "url"
]


class CustomFieldDefIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entityType: CustomFieldEntityType
    fieldName: str = Field(min_length=1, max_length=100)
    fieldType: CustomFieldType
    fieldOptions: dict[str, object] | None = None
    required: bool = False
    sortOrder: int = Field(default=0, ge=0)


class CustomFieldDefUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fieldName: str | None = Field(default=None, min_length=1, max_length=100)
    fieldType: CustomFieldType | None = None
    fieldOptions: dict[str, object] | None = None
    required: bool | None = None
    sortOrder: int | None = Field(default=None, ge=0)
    active: bool | None = None


class CustomFieldDefOut(BaseModel):
    id: str
    entityType: str
    fieldName: str
    fieldType: str
    fieldOptions: dict[str, object] | None
    required: bool
    sortOrder: int
    active: bool
    createdAt: datetime


class CustomFieldValueIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    valueText: str | None = None
    valueNumber: Decimal | None = None
    valueDate: date | None = None


class CustomFieldValueOut(BaseModel):
    fieldDefId: str
    fieldName: str
    fieldType: str
    valueText: str | None
    valueNumber: str | None
    valueDate: date | None


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------


class AttachmentOut(BaseModel):
    id: str
    entityType: str
    entityId: str
    filename: str
    contentType: str
    sizeBytes: int
    uploadedBy: str
    createdAt: datetime


# ---------------------------------------------------------------------------
# Email templates
# ---------------------------------------------------------------------------


class EmailTemplateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    subject: str = Field(default="", max_length=500)
    bodyHtml: str = Field(default="", max_length=50000)
    variables: list[str] = Field(default_factory=list)
    category: str | None = Field(default=None, max_length=50)


class EmailTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=200)
    subject: str | None = Field(default=None, max_length=500)
    bodyHtml: str | None = Field(default=None, max_length=50000)
    variables: list[str] | None = None
    category: str | None = None
    active: bool | None = None


class EmailTemplateOut(BaseModel):
    id: str
    name: str
    subject: str
    bodyHtml: str
    variables: list[str]
    category: str | None
    active: bool
    createdBy: str
    createdAt: datetime
    updatedAt: datetime


class TemplateRenderIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    context: dict[str, str] = Field(default_factory=dict)


class TemplateRenderOut(BaseModel):
    subject: str
    bodyHtml: str


# ---------------------------------------------------------------------------
# Email sequences
# ---------------------------------------------------------------------------


class SequenceStepIn(BaseModel):
    templateId: str
    delayDays: int = Field(default=0, ge=0)
    delayHours: int = Field(default=0, ge=0)


class SequenceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    steps: list[SequenceStepIn] = Field(default_factory=list)


class SequenceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    steps: list[SequenceStepIn] | None = None
    active: bool | None = None


class SequenceOut(BaseModel):
    id: str
    name: str
    description: str | None
    steps: list[dict[str, object]]
    active: bool
    createdBy: str
    createdAt: datetime
    updatedAt: datetime


# ---------------------------------------------------------------------------
# Web forms
# ---------------------------------------------------------------------------


class WebFormFieldConfig(BaseModel):
    name: str
    label: str
    type: str = "text"
    required: bool = False
    mapTo: str | None = None


class WebFormIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9][a-z0-9\-]*$")
    fieldsConfig: list[WebFormFieldConfig] = Field(default_factory=list)
    redirectUrl: str | None = Field(default=None, max_length=500)
    notifyEmail: EmailStr | None = None


class WebFormUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=200)
    fieldsConfig: list[WebFormFieldConfig] | None = None
    redirectUrl: str | None = None
    notifyEmail: EmailStr | None = None
    active: bool | None = None


class WebFormOut(BaseModel):
    id: str
    name: str
    slug: str
    fieldsConfig: list[dict[str, object]]
    redirectUrl: str | None
    notifyEmail: str | None
    active: bool
    submissionCount: int
    createdBy: str
    createdAt: datetime
    updatedAt: datetime


class WebFormSubmitIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data: dict[str, str]


class WebFormSubmitOut(BaseModel):
    leadId: str
    message: str = "Thank you for your submission"


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------


class DuplicateGroupOut(BaseModel):
    id: str
    entityType: str
    matchField: str
    matchValue: str
    entityIds: list[str]
    status: str
    mergedIntoId: str | None
    createdAt: datetime
    resolvedAt: datetime | None


class MergeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    winnerId: str


class MergeResult(BaseModel):
    merged: int
    winnerId: str
