from typing import Annotated

from pydantic import BaseModel, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)]
Industry = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class CrmSummary(BaseModel):
    leads: int
    openDeals: int
    wonDeals: int
    lostDeals: int
    pipelineValue: str
    wonValue: str


class CompanySummary(BaseModel):
    id: str
    name: str
    industry: str
    createdAt: str
    current: bool
    members: int
    openTickets: int
    crm: CrmSummary


class PortfolioSummary(BaseModel):
    companies: list[CompanySummary]


class CompanyCreate(BaseModel):
    name: Name
    industry: Industry = ""


class CompanyOut(BaseModel):
    id: str
    name: str
    industry: str
