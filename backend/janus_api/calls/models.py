from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class CustomerCall(Base):
    """A call with a customer: one made on a phone and logged here, or one in the browser.

    A browser call starts as a one-time link for the customer ("ringing"), becomes "live" when they
    open it, and "ended" when either side hangs up. Only the link's hash is kept.
    """

    __tablename__ = "customer_calls"
    __table_args__ = (
        CheckConstraint("method IN ('phone', 'browser')", name="ck_customer_calls_method"),
        CheckConstraint("direction IN ('outbound', 'inbound')", name="ck_customer_calls_direction"),
        CheckConstraint(
            "status IN ('logged', 'ringing', 'live', 'ended')", name="ck_customer_calls_status"
        ),
        CheckConstraint(
            "outcome IS NULL OR outcome IN "
            "('connected', 'no_answer', 'busy', 'voicemail', 'wrong_number')",
            name="ck_customer_calls_outcome",
        ),
        CheckConstraint(
            "duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400",
            name="ck_customer_calls_duration",
        ),
        CheckConstraint(
            "(method = 'browser') = (token_hash IS NOT NULL)", name="ck_customer_calls_token"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    contact_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("contacts.id"), index=True)
    agent_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    method: Mapped[str] = mapped_column(String(10))
    direction: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10))
    outcome: Mapped[str | None] = mapped_column(String(20))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(Text, default="", server_default="")
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Each time the customer opens the link; the agent's browser offers again when it changes.
    guest_joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustomerCallSignal(Base):
    """A WebRTC message between the agent and the customer in a browser call."""

    __tablename__ = "customer_call_signals"
    __table_args__ = (
        CheckConstraint("from_side IN ('agent', 'guest')", name="ck_customer_call_signals_side"),
        CheckConstraint(
            "kind IN ('offer', 'answer', 'ice', 'bye')", name="ck_customer_call_signals_kind"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    call_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("customer_calls.id", ondelete="CASCADE"), index=True
    )
    from_side: Mapped[str] = mapped_column(String(5))
    kind: Mapped[str] = mapped_column(String(10))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
