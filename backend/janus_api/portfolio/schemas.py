from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, EmailStr, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)]
Industry = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class CrmSummary(BaseModel):
    leads: int
    openDeals: int
    wonDeals: int
    lostDeals: int
    pipelineValue: str
    wonValue: str


class Ageing(BaseModel):
    """What customers owe past the due date, by how many days late."""

    days0to30: str
    days31to60: str
    over60: str


class MoneySummary(BaseModel):
    """Rupees as decimal strings, from the company's invoices, payments, credit notes and bills."""

    receivable: str
    overdue: str
    overdueInvoices: int
    ageing: Ageing
    payable: str
    payableDueThisWeek: str


PeriodKey = Literal["week", "month", "quarter", "fy"]


class Period(BaseModel):
    """The period to date and the same days of the period before. Days are inclusive, in India."""

    key: PeriodKey
    label: str
    start: str
    end: str
    previousStart: str
    previousEnd: str


class PeriodFigures(BaseModel):
    leads: int
    wonDeals: int
    wonValue: str
    # None where the person's role does not include money.
    invoiced: str | None
    collected: str | None


class PeriodCompare(BaseModel):
    current: PeriodFigures
    previous: PeriodFigures


class People(BaseModel):
    headcount: int
    onLeaveToday: int
    pendingLeave: int
    pendingClaims: int
    # None where the person's role does not include money.
    monthlyPayroll: str | None
    claimsValue: str | None


class Stock(BaseModel):
    items: int
    belowReorder: int
    expiringBatches: int
    dispatchesInTransit: int
    stockValue: str | None


class Delivery(BaseModel):
    activeProjects: int
    lateProjects: int
    overdueMilestones: int
    overdueTasks: int
    awaitingAcceptance: int
    awaitingAcceptanceValue: str


class Support(BaseModel):
    open: int
    urgent: int
    escalated: int
    olderThanWeek: int


class Approval(BaseModel):
    kind: str
    label: str
    # The label for a single one: "Leave request" beside "Leave requests".
    one: str
    count: int
    to: str


class AttentionItem(BaseModel):
    severity: Literal["high", "medium", "low"]
    text: str
    to: str


class Health(BaseModel):
    status: Literal["red", "amber", "green"]
    reasons: list[str]


class ComplianceDue(BaseModel):
    key: str
    label: str
    period: str
    area: str
    dueOn: str
    status: Literal["filed", "overdue", "due_soon", "upcoming"]
    filedOn: str | None
    to: str


class Targets(BaseModel):
    """Monthly targets; None where none is set. Collected is None where money is not shared."""

    leads: str | None
    wonValue: str | None
    collected: str | None


GstFiling = Literal["none", "monthly", "quarterly"]
# Upper-cased before the format check, so a GSTIN typed in lower case is accepted.
Gstin = Annotated[
    str,
    BeforeValidator(lambda value: value.strip().upper() if isinstance(value, str) else value),
    StringConstraints(pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$"),
]


class CompliancePlan(BaseModel):
    """Which filings apply to the company."""

    gstin: Gstin | None = None
    gstFiling: GstFiling = "none"
    tds: bool = False
    pfEsi: bool = False
    company: bool = False


class TargetsUpdate(BaseModel):
    leads: Annotated[Decimal, Field(ge=0, le=10**12)] | None = None
    wonValue: Annotated[Decimal, Field(ge=0, le=10**12)] | None = None
    collected: Annotated[Decimal, Field(ge=0, le=10**12)] | None = None


class FilingMark(BaseModel):
    filedOn: date


class CompanySummary(BaseModel):
    id: str
    name: str
    industry: str
    createdAt: str
    current: bool
    members: int
    openTickets: int
    crm: CrmSummary
    # None where the person's role does not include money (Group analyst).
    money: MoneySummary | None
    period: PeriodCompare
    # The operating view. Left out (None) where only the headline is needed, as in the digest.
    people: People | None = None
    stock: Stock | None = None
    delivery: Delivery | None = None
    support: Support | None = None
    approvals: list[Approval] = []
    compliance: list[ComplianceDue] = []
    compliancePlan: CompliancePlan | None = None
    targets: Targets | None = None
    attention: list[AttentionItem] = []
    health: Health | None = None


class PortfolioSummary(BaseModel):
    period: Period
    companies: list[CompanySummary]


class CompanyCreate(BaseModel):
    name: Name
    industry: Industry = ""


class CompanyOut(BaseModel):
    id: str
    name: str
    industry: str


# Who an Owner may share the Portfolio with: a co-owner, or one of the two group roles.
AccessRole = Literal["owner", "group_finance", "group_analyst"]


class AccessGrant(BaseModel):
    email: EmailStr
    role: AccessRole
    # Company ids to share. Empty means every company the Owner owns.
    companies: list[str] = []


class AccessRemove(BaseModel):
    email: EmailStr


class AccessCompany(BaseModel):
    id: str
    name: str
    role: str
    # "active" once they joined, "invited" while the invitation is open.
    status: str


class AccessPerson(BaseModel):
    email: str
    name: str | None
    companies: list[AccessCompany]


class AccessList(BaseModel):
    people: list[AccessPerson]


class AccessSkipped(BaseModel):
    company: str
    reason: str


class AccessResult(BaseModel):
    done: list[str]
    skipped: list[AccessSkipped]


class DigestOut(BaseModel):
    enabled: bool
    # Whether this person sees any Portfolio, so a digest would have something to say.
    eligible: bool
    nextDueAt: datetime | None
    lastSentAt: datetime | None


class DigestUpdate(BaseModel):
    enabled: bool


class DigestPreview(BaseModel):
    subject: str
    body: str
