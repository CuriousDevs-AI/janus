from typing import Literal

from pydantic import BaseModel, Field

PlanId = Literal["free", "startup", "growth", "enterprise"]


class PlanOut(BaseModel):
    id: PlanId
    name: str
    tagline: str
    # Rupees a month before GST; None is priced by agreement (Enterprise).
    price: str | None
    companies: int | None
    logins: int | None
    features: list[str]


class InvoiceOut(BaseModel):
    number: str
    plan: str
    issuedOn: str
    periodStart: str
    periodEnd: str
    amount: str
    gst: str
    total: str
    status: Literal["paid", "due"]
    paidOn: str | None
    sample: bool


class Usage(BaseModel):
    companies: int
    # Active logins across the companies, a person in two counted in each.
    logins: int


class BillingOut(BaseModel):
    # False for someone who owns no company: the plan is the Owner's.
    owner: bool
    plan: PlanId
    # None while on Free, which never started as a paid plan.
    startedOn: str | None
    renewsOn: str | None
    usage: Usage
    gstRate: int
    plans: list[PlanOut]
    invoices: list[InvoiceOut]
    # Whether the plan can be changed here. Payments are not connected, so only outside production.
    canChange: bool


class PlanChange(BaseModel):
    plan: PlanId


class SampleInvoices(BaseModel):
    months: int = Field(default=6, ge=1, le=12)
