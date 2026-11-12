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
    # Whether the plan can be changed here without paying: outside production only (test mode).
    canChange: bool
    # How a paid plan is bought: through Razorpay, in test mode with nothing charged, or not at all.
    payments: Literal["razorpay", "test", "off"]


class PlanChange(BaseModel):
    plan: PlanId


class SampleInvoices(BaseModel):
    months: int = Field(default=6, ge=1, le=12)


class Checkout(BaseModel):
    plan: Literal["startup", "growth"]


class CheckoutOut(BaseModel):
    """What Razorpay Checkout needs in the browser. The key id is public; the secret stays here."""

    keyId: str
    orderId: str
    # In paise, GST included.
    amount: int
    currency: Literal["INR"]
    plan: str
    description: str
    name: str
    email: str


class CheckoutVerify(BaseModel):
    orderId: str = Field(max_length=40)
    paymentId: str = Field(max_length=40)
    signature: str = Field(max_length=128)
