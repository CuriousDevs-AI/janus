from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class AICredential(Base):
    __tablename__ = "ai_credentials"
    __table_args__ = (
        UniqueConstraint("tenant_id", "provider"),
        CheckConstraint("provider IN ('openai', 'anthropic', 'gemini', 'openai_compatible')"),
    )
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(160))
    secret_encrypted: Mapped[str] = mapped_column(String)
    key_last_four: Mapped[str] = mapped_column(String(4))
    base_url: Mapped[str | None] = mapped_column(String(2048))
    enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AIUsage(Base):
    __tablename__ = "ai_usage"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'succeeded', 'failed')"),
        CheckConstraint("input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0"),
        CheckConstraint("cost_usd >= 0"),
    )
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(160))
    feature: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    input_tokens: Mapped[int | None] = mapped_column(BigInteger)
    output_tokens: Mapped[int | None] = mapped_column(BigInteger)
    total_tokens: Mapped[int | None] = mapped_column(BigInteger)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 10))
    error_code: Mapped[str | None] = mapped_column(String(80))
    latency_ms: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
