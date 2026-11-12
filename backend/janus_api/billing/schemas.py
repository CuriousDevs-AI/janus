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


GSTIN = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$"


class BillingDetails(BaseModel):
    """Who Janus bills, as a GST tax invoice names them."""

    legalName: str = Field(min_length=2, max_length=160)
    gstin: str | None = Field(default=None, pattern=GSTIN)
    # The GST state code (two digits): the place of supply. Taken from the GSTIN when there is one.
    stateCode: str = Field(pattern=r"^[0-9]{2}$")
    address: str | None = Field(default=None, max_length=400)


class Seller(BaseModel):
    legalName: str
    gstin: str | None
    stateCode: str | None
    address: str | None
    sac: str


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
    # The GST split by place of supply: CGST and SGST within Janus's state, IGST otherwise. None
    # until both states are known.
    cgst: str | None = None
    sgst: str | None = None
    igst: str | None = None


class CompanyUsage(BaseModel):
    id: str
    name: str
    # People who can sign in to the company, and invitations not yet accepted.
    people: int
    invited: int


class Usage(BaseModel):
    companies: int
    # Seats the plan counts: people and open invitations across the companies, a person in two
    # counted in each, as the plan's people limit counts them.
    logins: int
    byCompany: list[CompanyUsage]


class PlanChange(BaseModel):
    plan: PlanId
    # Companies to keep when the plan holds fewer than the account has; the rest are archived.
    keep: list[str] = Field(default_factory=list, max_length=50)


class Company(BaseModel):
    id: str
    name: str


class KeepOption(Company):
    # The company this session is in, which is always kept.
    current: bool
    keep: bool


class Person(BaseModel):
    name: str
    company: str


class RefundPreview(BaseModel):
    invoice: str
    plan: str
    daysUsed: int
    daysTotal: int
    daysUnused: int
    # Rupees, GST included, for the days not used.
    amount: str
    # Back to the Razorpay payment, or recorded only (test mode or a sample invoice).
    method: Literal["razorpay", "test"]


class ChangePreview(BaseModel):
    """What moving to another plan does, before it is done."""

    plan: PlanId
    companyLimit: int | None
    peopleLimit: int | None
    companies: list[KeepOption]
    archiveCompanies: list[Company]
    archivePeople: list[Person]
    # People in the companies being archived, who cannot open them until they come back.
    loseAccess: list[Person] = Field(default_factory=list)
    withdrawInvitations: list[Person]
    restoreCompanies: list[Company]
    restorePeople: list[Person]
    refund: RefundPreview | None
    # Rupees, GST included, paid for a month of the new plan; None when it costs nothing.
    charge: str | None


class RefundOut(BaseModel):
    invoice: str
    plan: str
    daysUnused: int
    daysTotal: int
    amount: str
    status: Literal["refunded", "test", "failed"]
    createdOn: str


class SampleInvoices(BaseModel):
    months: int = Field(default=6, ge=1, le=12)


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


class Checkout(BaseModel):
    plan: Literal["startup", "growth"]
    # Companies to keep when the plan holds fewer than the account has; the rest are archived.
    keep: list[str] = Field(default_factory=list, max_length=50)


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
    # Whether the Owner has chosen a plan yet; a new account is asked first.
    chosen: bool
    refunds: list[RefundOut]
    # Companies archived because the plan holds fewer; they come back when it has room.
    archived: list[Company]
    # The buyer and seller on Janus's tax invoices; the buyer is asked once.
    billTo: BillingDetails | None = None
    seller: Seller | None = None
