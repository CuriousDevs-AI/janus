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
    # Bills past their due date; payableDueThisWeek includes these.
    payableLate: str = "0.00"
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
    # For a filing past due: the late fee to date in rupees where it is a daily or flat fee (an
    # estimate), and what the cost is made of.
    lateFee: str | None = None
    lateNote: str | None = None


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


LeaderRole = Literal["director", "founder", "cofounder"]


def _director_only() -> list[LeaderRole]:
    return ["director"]


class Director(BaseModel):
    """One of the company's people: a director, a founder, a co-founder, or more than one."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    din: Annotated[str | None, BeforeValidator(_blank_to_none)] = Field(
        default=None, pattern=r"^[0-9]{8}$"
    )
    # Recorded before roles existed, everyone was a director.
    roles: list[LeaderRole] = Field(default_factory=_director_only, max_length=3)
    title: Text = Field(default=None, max_length=80)


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
    website: Text = Field(default=None, max_length=200)
    email: Annotated[str | None, BeforeValidator(_blank_to_none)] = Field(
        default=None, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$"
    )
    phone: Text = Field(default=None, max_length=32)
    city: Text = Field(default=None, max_length=80)
    state: Text = Field(default=None, max_length=40)
    directors: list[Director] = Field(default_factory=list, max_length=30)


class ComplianceGap(BaseModel):
    """A registration detail that is missing, or a filing the company's own records suggest."""

    kind: Literal["missing", "suggestion"]
    text: str
    # For a suggestion that one switch answers: the part of the filing plan to switch on.
    switch: Literal["tds", "pfEsi", "company"] | None = None


class Books(BaseModel):
    """From the books, in rupees: sales before GST less credit notes; supplier bills as recorded
    plus write-offs; and money in from customers and out to suppliers."""

    netSales: str
    costs: str
    profitBeforePayroll: str
    moneyIn: str
    moneyOut: str
    # Salaries posted to the books for months in the span, and which months ("2026-10"). Where
    # every month the span touches is posted, profit after salaries is recorded, not estimated.
    salariesPosted: str = "0.00"
    salariesMonths: list[str] = []
    salariesComplete: bool = False


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
    # The same, in the same days of the period before, so the group's change is like for like.
    salesBefore: str = "0.00"
    purchasesBefore: str = "0.00"
    partners: list[str]


class GstMonth(BaseModel):
    """GST for one month from the books, in rupees: GST charged on invoices, GST paid on supplier
    bills (input credit, where it was recorded), and the difference."""

    month: str
    label: str
    output: str
    input: str
    # Output less input; negative is credit left over.
    payable: str
    # Supplier bills in the month recorded without their GST, so input credit may be higher.
    billsWithoutGst: int


class GstPosition(BaseModel):
    gstin: str | None
    lastMonth: GstMonth
    thisMonth: GstMonth


class CashAccount(BaseModel):
    account: str
    balance: str | None
    asOf: str


class CashPosition(BaseModel):
    """Cash in the bank from imported statements, in rupees, and how long it lasts."""

    total: str | None
    asOf: str
    accounts: list[CashAccount]
    # Money out less money in per month over the statement's last 90 days; None when more came in.
    monthlyBurn: str | None
    # Months the cash lasts at that pace; None when cash is unknown or nothing is burning.
    runwayMonths: float | None


class PayrollMonth(BaseModel):
    month: str
    label: str
    # The amount posted, or None while it is not; what HR's salaries would post now.
    posted: str | None
    fromHr: str


class CompanySummary(BaseModel):
    id: str
    name: str
    industry: str
    companySize: str = ""
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
    # False until at least one kind of filing is switched on for the company.
    complianceSetUp: bool = False
    # Every filing past due and not recorded as filed since unfiledSince, not only the last 90 days.
    unfiledCount: int = 0
    unfiledSince: str | None = None
    # GST from the books, for a role with money: None without money or with GST not set up.
    gst: GstPosition | None = None
    # Cash in the bank from imported statements, for a role with money.
    cash: CashPosition | None = None
    # Last month's salaries: whether they are posted to the books, for a role with money.
    payroll: PayrollMonth | None = None
    # Registrations, licences, insurance and trademarks, with expiry dates.
    documents: list["CompanyDocumentOut"] = []


class PortfolioSummary(BaseModel):
    period: Period
    companies: list[CompanySummary]


class CompanyCreate(BaseModel):
    name: Name
    industry: Industry = ""


class CompanyDetails(BaseModel):
    name: Name
    industry: Industry = ""
    companySize: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] = ""


class CompanyOut(BaseModel):
    id: str
    name: str
    industry: str


# Who an Owner may share the Portfolio with: a co-owner, or one of the two group roles.
AccessRole = Literal[
    "owner",
    "group_admin",
    "company_admin",
    "finance_manager",
    "operations_manager",
    "group_finance",
    "group_analyst",
]


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
    # For a role with money: the document and the amount, such as "INV-0012 · Kavita Stores".
    detail: str | None = None
    amount: str | None = None
    # How many events of the same kind by the same person this line stands for (a burst).
    count: int = 1
    # "change" for an edit, "reversal" for something undone or taken back.
    flag: Literal["change", "reversal"] | None = None


class ActivityList(BaseModel):
    days: int
    items: list[ActivityItem]


class TrendPoint(BaseModel):
    """One day, week or month. Money is a rupee string, or None without money."""

    month: str
    leads: int
    wonDeals: int
    wonValue: str
    netSales: str | None
    costs: str | None
    collected: str | None
    # Sales and costs from a month imported from another system, not from Janus's records.
    imported: bool = False


class CompanyTrend(BaseModel):
    id: str
    name: str
    points: list[TrendPoint]


class Trends(BaseModel):
    unit: Literal["day", "week", "month"] = "month"
    # The start of each day, week (YYYY-MM-DD) or month (YYYY-MM), oldest first.
    months: list[str]
    labels: list[str]
    companies: list[CompanyTrend]


class ModelOption(BaseModel):
    """A way to answer Portfolio questions: Janus rules, or a model a company set up."""

    id: str
    label: str
    provider: str | None = None
    company: str | None = None
    free: bool = False
    note: str = ""


class AiKey(BaseModel):
    provider: str
    model: str
    keyLastFour: str
    baseUrl: str | None
    enabled: bool


class AiCompany(BaseModel):
    """A company where this person may set up a model, with what it has, and this month's spend
    on Portfolio questions against the cap, in US dollars."""

    id: str
    name: str
    keys: list[AiKey]
    spentUsd: str
    capUsd: str


class FreeProvider(BaseModel):
    """A provider that gives a free API key: its free models, limits and where to get a key."""

    id: str
    name: str
    provider: str
    baseUrl: str | None
    models: list[str]
    limits: str
    keyUrl: str
    # The provider's own, current list of models.
    modelsUrl: str


class ModelsOut(BaseModel):
    options: list[ModelOption]
    companies: list[AiCompany]
    free: list[FreeProvider] = []


AiProvider = Literal[
    "openai",
    "anthropic",
    "gemini",
    "openai_compatible",
    "openrouter",
    "groq",
    "cerebras",
    "mistral",
    "sambanova",
    "github",
    "nvidia",
    "huggingface",
]


class AiKeyPut(BaseModel):
    model: str
    apiKey: str | None = None
    baseUrl: str | None = None
    enabled: bool = True


class AskIn(BaseModel):
    question: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
    ]
    model: Annotated[str, StringConstraints(max_length=60)]
    period: PeriodKey = "month"


class Source(BaseModel):
    """A fact or passage an answer was given and cited: F for a figure from the Portfolio, K for
    an approved fact, D for a passage of a document."""

    id: str
    kind: Literal["figure", "knowledge", "document"]
    company: str
    text: str
    title: str | None = None


class AskOut(BaseModel):
    id: str
    question: str
    answer: str
    model: str
    sources: list[Source]
    # False when the answer cites nothing it was given: the page says so beside it.
    grounded: bool
    costUsd: str | None
    # Facts Janus suggested remembering; they wait for the owner's approval.
    suggested: list[str]
    createdAt: str


class KnowledgeItem(BaseModel):
    id: str
    companyId: str
    company: str
    kind: Literal["fact", "document"]
    status: Literal["approved", "suggested"]
    title: str
    body: str
    document: str | None
    passage: int
    createdAt: str


class KnowledgeAdd(BaseModel):
    companyId: str
    kind: Literal["fact", "document"]
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100000)]


class Thresholds(BaseModel):
    """When a company turns red for this person. The defaults are the Portfolio's own."""

    # Money customers owe is red once any of it is this many days past due. Ageing is kept in
    # 30-day buckets, so 30 or 60.
    overdueRedAfterDays: Literal[30, 60] = 60
    # Overdue amounts below this, in rupees, are not flagged at all.
    overdueMinimum: int = Field(default=0, ge=0, le=10**10)
    # Approvals waiting turn red above this many.
    approvalsRedAbove: int = Field(default=5, ge=0, le=1000)
    # Late supplier bills turn red at this share, in percent, of what is due within 7 days.
    lateBillsRedShare: int = Field(default=50, ge=0, le=100)


ReadKey = Annotated[str, StringConstraints(max_length=400)]


class Preferences(BaseModel):
    # Notifications read, as the page names them; the newest 1,000 are kept.
    read: list[ReadKey] = Field(default_factory=list, max_length=1000)
    # Work inbox items snoozed: their key, and until when (milliseconds since 1970).
    snoozed: dict[ReadKey, int] = Field(default_factory=dict)
    thresholds: Thresholds = Field(default_factory=Thresholds)


class RegisterRow(BaseModel):
    """One line of the filing register: every filing due for a company, filed or not."""

    companyId: str
    company: str
    key: str
    label: str
    period: str
    area: str
    dueOn: str
    status: Literal["filed", "overdue", "due_soon", "upcoming"]
    filedOn: str | None
    acknowledgement: str | None
    lateFee: str | None
    lateNote: str | None


class AlertsSetting(BaseModel):
    """Whether this person gets an email when a company turns red."""

    enabled: bool


DocumentKind = Literal["registration", "licence", "insurance", "trademark", "contract", "other"]


class CompanyDocumentIn(BaseModel):
    kind: DocumentKind
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)]
    number: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    issuedOn: date | None = None
    expiresOn: date | None = None
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=400)] | None = None


class CompanyDocumentOut(BaseModel):
    id: str
    kind: DocumentKind
    name: str
    number: str | None
    issuedOn: str | None
    expiresOn: str | None
    notes: str | None
    # Days until it expires; negative once it has. None without an expiry date.
    daysLeft: int | None
    status: Literal["valid", "expiring", "expired", "no_expiry"]


class IntercompanyLink(BaseModel):
    """An invoice one of the person's companies raised to another, and the bill recorded for it
    there (None while it is missing)."""

    sellerId: str
    seller: str
    buyerId: str
    buyer: str
    invoice: str
    invoiceDate: str
    amount: str
    gst: str
    bill: str | None
    # Whether this person may record the missing bill in the buying company.
    canRecord: bool


class IntercompanyRecord(BaseModel):
    sellerId: str
    invoice: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class PayrollPost(BaseModel):
    month: Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


BankAmount = Annotated[str, StringConstraints(pattern=r"^-?\d{1,13}(\.\d{1,2})?$")]


class BankRowIn(BaseModel):
    date: date
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = ""
    # Money in is positive, money out negative, in rupees.
    amount: BankAmount
    balance: BankAmount | None = None


class BankStatementIn(BaseModel):
    account: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    rows: list[BankRowIn] = Field(min_length=1, max_length=5000)


class BankImported(BaseModel):
    added: int
    skipped: int


HistoryAmount = Annotated[str, StringConstraints(pattern=r"^\d{1,13}(\.\d{1,2})?$")]


class HistoryMonthIn(BaseModel):
    month: Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
    sales: HistoryAmount
    costs: HistoryAmount = "0"


class HistoryIn(BaseModel):
    source: Literal["tally", "zoho", "other"]
    months: list[HistoryMonthIn] = Field(min_length=1, max_length=120)
