from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class FinanceBudgetLine(Base):
    """A budget line in paise (1/100 rupee). drawn_paise is the running total and is only changed
    inside the transaction that also writes the draw or release row."""

    __tablename__ = "finance_budget_lines"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_key"),
        CheckConstraint("allocated_paise >= 0", name="ck_budget_allocated"),
        CheckConstraint("drawn_paise >= 0", name="ck_budget_drawn"),
        CheckConstraint("drawn_paise <= allocated_paise", name="ck_budget_within_allocation"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    external_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    owner_name: Mapped[str] = mapped_column(String(160))
    allocated_paise: Mapped[int] = mapped_column(BigInteger)
    drawn_paise: Mapped[int] = mapped_column(BigInteger, default=0)


class FinanceBudgetMovement(Base):
    """A draw (positive) or a release (negative) against a budget line. The idempotency key makes a
    retried request return the first result instead of moving money twice."""

    __tablename__ = "finance_budget_movements"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("amount_paise <> 0", name="ck_movements_amount"),
        CheckConstraint("kind IN ('draw', 'release', 'allocation')", name="ck_movements_kind"),
        CheckConstraint(
            "(kind = 'release' AND amount_paise < 0)"
            " OR (kind IN ('draw', 'allocation') AND amount_paise > 0)",
            name="ck_movements_sign",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    kind: Mapped[str] = mapped_column(String(12), server_default="draw")
    line_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("finance_budget_lines.id"))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str] = mapped_column(String(300), default="")
    booked_on: Mapped[date] = mapped_column(Date)
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FinanceInvoice(Base):
    """A GST tax invoice. The server computes its totals in paise; the screen never sends them."""

    __tablename__ = "finance_invoices"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number"),
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("taxable_paise >= 0 AND total_paise >= 0", name="ck_invoices_amounts"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    number: Mapped[str] = mapped_column(String(20))
    customer: Mapped[str] = mapped_column(String(160))
    customer_company: Mapped[str] = mapped_column(String(160), default="")
    deal_ref: Mapped[str | None] = mapped_column(String(80))
    invoice_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date)
    same_state: Mapped[bool] = mapped_column(Boolean)
    taxable_paise: Mapped[int] = mapped_column(BigInteger)
    cgst_paise: Mapped[int] = mapped_column(BigInteger)
    sgst_paise: Mapped[int] = mapped_column(BigInteger)
    igst_paise: Mapped[int] = mapped_column(BigInteger)
    total_paise: Mapped[int] = mapped_column(BigInteger)
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_by_name: Mapped[str] = mapped_column(String(160))
    idempotency_key: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FinanceInvoiceLine(Base):
    __tablename__ = "finance_invoice_lines"
    __table_args__ = (
        UniqueConstraint("invoice_id", "position"),
        CheckConstraint("qty > 0 AND rate_paise > 0", name="ck_invoice_lines_amounts"),
        CheckConstraint("gst_rate >= 0 AND gst_rate <= 28", name="ck_invoice_lines_gst"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    invoice_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("finance_invoices.id"))
    position: Mapped[int] = mapped_column(Integer)
    item: Mapped[str] = mapped_column(String(200))
    hsn: Mapped[str] = mapped_column(String(8))
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    rate_paise: Mapped[int] = mapped_column(BigInteger)
    gst_rate: Mapped[int] = mapped_column(Integer)


class FinancePayment(Base):
    """Money received against an invoice, written with the check of what is still due."""

    __tablename__ = "finance_payments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("amount_paise > 0", name="ck_payments_amount"),
        CheckConstraint(
            "method IN ('UPI', 'Bank transfer', 'Cash', 'Cheque')", name="ck_payments_method"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    invoice_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("finance_invoices.id"))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    method: Mapped[str] = mapped_column(String(20))
    reference: Mapped[str] = mapped_column(String(80))
    paid_on: Mapped[date] = mapped_column(Date)
    recorded_by_name: Mapped[str] = mapped_column(String(160))
    idempotency_key: Mapped[str] = mapped_column(String(80))


class FinanceCreditNote(Base):
    """A credit note or a write-off against an invoice. Pending notes reduce what is due only once
    someone other than the person who raised them approves."""

    __tablename__ = "finance_credit_notes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number"),
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("amount_paise > 0", name="ck_credit_notes_amount"),
        CheckConstraint("kind IN ('credit', 'write-off')", name="ck_credit_notes_kind"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="ck_credit_notes_status"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    invoice_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("finance_invoices.id"))
    number: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(12))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    reason: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(10))
    noted_on: Mapped[date] = mapped_column(Date)
    ticket_ref: Mapped[str | None] = mapped_column(String(64))
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_by_name: Mapped[str] = mapped_column(String(160))
    approved_by_name: Mapped[str | None] = mapped_column(String(160))
    rejected_by_name: Mapped[str | None] = mapped_column(String(160))
    rejected_reason: Mapped[str | None] = mapped_column(String(300))
    idempotency_key: Mapped[str] = mapped_column(String(80))


class FinanceBill(Base):
    """What the company owes a vendor. A bill for a purchase order is paid only when it matches."""

    __tablename__ = "finance_bills"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number"),
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("amount_paise > 0", name="ck_finance_bills_amount"),
        CheckConstraint("due_date >= bill_date", name="ck_finance_bills_dates"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    number: Mapped[str] = mapped_column(String(20))
    vendor: Mapped[str] = mapped_column(String(160))
    vendor_bill_no: Mapped[str] = mapped_column(String(80))
    bill_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    po_key: Mapped[str | None] = mapped_column(String(64))
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_by_name: Mapped[str] = mapped_column(String(160))
    idempotency_key: Mapped[str] = mapped_column(String(80))


class FinanceBillPayment(Base):
    __tablename__ = "finance_bill_payments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("amount_paise > 0", name="ck_finance_bill_payments_amount"),
        CheckConstraint(
            "method IN ('UPI', 'Bank transfer', 'Cash', 'Cheque')",
            name="ck_finance_bill_payments_method",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    bill_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("finance_bills.id"))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    method: Mapped[str] = mapped_column(String(20))
    reference: Mapped[str] = mapped_column(String(80))
    paid_on: Mapped[date] = mapped_column(Date)
    recorded_by_name: Mapped[str] = mapped_column(String(160))
    idempotency_key: Mapped[str] = mapped_column(String(80))


class FinanceFundRequest(Base):
    """A request for money from a budget line. Approval allocates the money to that line."""

    __tablename__ = "finance_fund_requests"
    __table_args__ = (
        UniqueConstraint("tenant_id", "req_key"),
        UniqueConstraint("tenant_id", "number"),
        UniqueConstraint("tenant_id", "idempotency_key"),
        CheckConstraint("amount_paise > 0", name="ck_fund_requests_amount"),
        CheckConstraint(
            "status IN ('pending', 'awaiting_finance', 'approved', 'rejected')",
            name="ck_fund_requests_status",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    req_key: Mapped[str] = mapped_column(String(64))
    number: Mapped[str] = mapped_column(String(20))
    purpose: Mapped[str] = mapped_column(String(200))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    budget_line_key: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20))
    requested_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    requested_by_name: Mapped[str] = mapped_column(String(160))
    owner_approved_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    owner_approved_by_name: Mapped[str | None] = mapped_column(String(160))
    finance_approved_by_name: Mapped[str | None] = mapped_column(String(160))
    rejected_by_name: Mapped[str | None] = mapped_column(String(160))
    rejected_reason: Mapped[str | None] = mapped_column(String(300))
    raised_on: Mapped[date] = mapped_column(Date)
    idempotency_key: Mapped[str] = mapped_column(String(80))
