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
    acknowledgement: str | None = None


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
    # The acknowledgement number from the portal (ARN, challan or SRN), when there is one.
    acknowledgement: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)] | None
    ) = None


def _blank_to_none(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _upper(value: object) -> object:
    value = _blank_to_none(value)
    return value.upper() if isinstance(value, str) else value


EntityType = Literal[
    "pvt_ltd", "public_ltd", "opc", "llp", "partnership", "proprietorship", "other"
]
Text = Annotated[str | None, BeforeValidator(_blank_to_none)]
Code = Annotated[str | None, BeforeValidator(_upper)]


class Director(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    din: Annotated[str | None, BeforeValidator(_blank_to_none)] = Field(
        default=None, pattern=r"^[0-9]{8}$"
    )


class Registration(BaseModel):
    """A company's registration details. Every field is optional; what is missing is listed."""

    entityType: EntityType | None = None
    legalName: Text = Field(default=None, max_length=160)
    cin: Code = Field(default=None, pattern=r"^[A-Z0-9-]{7,21}$")
    pan: Code = Field(default=None, pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]$")
    tan: Code = Field(default=None, pattern=r"^[A-Z]{4}[0-9]{5}[A-Z]$")
    epfCode: Code = Field(default=None, max_length=30)
    esiCode: Code = Field(default=None, max_length=30)
    ptState: Code = Field(default=None, pattern=r"^[A-Z]{2}$")
    udyam: Code = Field(default=None, max_length=30)
    incorporatedOn: date | None = None
    registeredAddress: Text = Field(default=None, max_length=400)
    directors: list[Director] = Field(default_factory=list, max_length=20)


class ComplianceGap(BaseModel):
    """A registration detail that is missing, or a filing the company's own records suggest."""

    kind: Literal["missing", "suggestion"]
    text: str


class Books(BaseModel):
    """From the books, in rupees: sales before GST less credit notes; supplier bills as recorded
    plus write-offs; and money in from customers and out to suppliers."""

    netSales: str
    costs: str
    profitBeforePayroll: str
    moneyIn: str
    moneyOut: str


class BooksCompare(BaseModel):
    current: Books
    previous: Books


class CustomerMove(BaseModel):
    """One customer's sales before GST in the period and in the same days before, in rupees."""

    name: str
    current: str
    previous: str


class SourceMove(BaseModel):
    """Leads from one channel in the period and in the same days before."""

    source: str
    current: int
    previous: int


class Intercompany(BaseModel):
    """Sales to, and bills from, the other companies in this Portfolio in the period, matched by
    the company's name on the invoice or bill."""

    sales: str
    purchases: str
    partners: list[str]


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
    # Money: None, or empty, where the role does not include it.
    books: BooksCompare | None = None
    customers: list[CustomerMove] = []
    intercompany: Intercompany | None = None
    leadSources: list[SourceMove] = []
    registration: Registration | None = None
    complianceGaps: list[ComplianceGap] = []


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


class ActivityItem(BaseModel):
    companyId: str
    company: str
    at: datetime
    area: str
    who: str
    text: str


class ActivityList(BaseModel):
    days: int
    items: list[ActivityItem]
