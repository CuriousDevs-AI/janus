from datetime import date

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class SupportTicket(Base):
    """A support ticket's number, status, assignee and resolution.

    Conversations, handoffs and SLA timers stay on the screen. `external_key` is the id the screen
    gives the ticket, so a ticket made before this table existed can be sent up once.
    """

    __tablename__ = "support_tickets"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_key", name="uq_support_tickets_key"),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')", name="ck_support_tickets_priority"
        ),
        CheckConstraint(
            "status IN ('open', 'ai_handling', 'waiting_customer', 'escalated', 'in_progress', "
            "'resolved', 'closed')",
            name="ck_support_tickets_status",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    external_key: Mapped[str] = mapped_column(String(64))
    number: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(200))
    priority: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20))
    assignee: Mapped[str | None] = mapped_column(String(64))
    resolution: Mapped[str | None] = mapped_column(String(300))
    opened_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    raised_on: Mapped[date] = mapped_column(Date)
