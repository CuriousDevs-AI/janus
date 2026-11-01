from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, StringConstraints

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


PeriodKey = Literal["month", "quarter", "fy"]


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
