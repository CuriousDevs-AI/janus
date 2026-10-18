from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class SourceConnection(Base):
    __tablename__ = "source_connections"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        CheckConstraint("status IN ('connected', 'available')"),
        CheckConstraint(
            "kind IN ('webhook', 'embed', 'api_key', 'csv', 'oauth')", name="source_connection_kind"
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(1000), default="")
    kind: Mapped[str] = mapped_column(String(30), default="webhook")
    preset: Mapped[str] = mapped_column(String(40), default="custom")
    field_mapping: Mapped[list[dict[str, str]]] = mapped_column(JSONB)
    public_key: Mapped[str] = mapped_column(String(64), unique=True)
    secret_encrypted: Mapped[str | None] = mapped_column(String)
    allowed_origins: Mapped[list[str]] = mapped_column(ARRAY(String), server_default=text("'{}'"))
    event_id_field: Mapped[str | None] = mapped_column(String(200))
    owner_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="connected")
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IngestReceipt(Base):
    # This unpartitioned key outlives the raw daily payload partition.
    __tablename__ = "ingest_receipts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "connection_id", "idempotency_key"),
        ForeignKeyConstraint(
            ["tenant_id", "connection_id", "csv_import_id"],
            ["csv_imports.tenant_id", "csv_imports.connection_id", "csv_imports.id"],
            name="csv_receipt_import_fk",
        ),
        CheckConstraint(
            "(csv_import_id IS NULL AND row_number IS NULL) OR "
            "(csv_import_id IS NOT NULL AND row_number IS NOT NULL AND row_number >= 2)",
            name="csv_receipt_row_check",
        ),
        UniqueConstraint("csv_import_id", "row_number", name="csv_receipt_row_unique"),
        UniqueConstraint("tenant_id", "id", "received_day"),
        UniqueConstraint("tenant_id", "id"),
        ForeignKeyConstraint(
            ["tenant_id", "connection_id"],
            ["source_connections.tenant_id", "source_connections.id"],
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    connection_id: Mapped[int] = mapped_column(BigInteger)
    csv_import_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    row_number: Mapped[int | None]
    idempotency_key: Mapped[str] = mapped_column(String(128))
    payload_hash: Mapped[str] = mapped_column(String(64))
    received_day: Mapped[date] = mapped_column(Date)


class RawEvent(Base):
    __tablename__ = "raw_events"
    __table_args__ = (
        UniqueConstraint("tenant_id", "receipt_id", "received_day"),
        ForeignKeyConstraint(
            ["tenant_id", "receipt_id", "received_day"],
            ["ingest_receipts.tenant_id", "ingest_receipts.id", "ingest_receipts.received_day"],
        ),
        CheckConstraint("status IN ('pending', 'processed', 'failed')"),
        {"postgresql_partition_by": "RANGE (received_day)"},
    )
    received_day: Mapped[date] = mapped_column(Date, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    receipt_id: Mapped[int] = mapped_column(BigInteger)
    payload: Mapped[dict[str, object]] = mapped_column(JSONB)
    field_mapping: Mapped[list[dict[str, str]]] = mapped_column(JSONB)
    preset: Mapped[str] = mapped_column(String(40), server_default="custom")
    source: Mapped[str] = mapped_column(String(30), server_default="webhook")
    owner_id: Mapped[int | None] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    result: Mapped[str | None] = mapped_column(String(30))
    error_code: Mapped[str | None] = mapped_column(String(80))
    contact_id: Mapped[int | None] = mapped_column(BigInteger)
    lead_id: Mapped[int | None] = mapped_column(BigInteger)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ApiKey(Base):
    __tablename__ = "api_keys"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "connection_id"],
            ["source_connections.tenant_id", "source_connections.id"],
        ),
        CheckConstraint("scopes = ARRAY['leads:ingest']::varchar[]", name="api_key_scopes"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    connection_id: Mapped[int] = mapped_column(BigInteger, index=True)
    name: Mapped[str] = mapped_column(String(120))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    prefix: Mapped[str] = mapped_column(String(16))
    scopes: Mapped[list[str]] = mapped_column(ARRAY(String))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FormRateLimit(Base):
    __tablename__ = "form_rate_limits"
    __table_args__ = (
        UniqueConstraint("tenant_id", "connection_id", "ip_hash"),
        ForeignKeyConstraint(
            ["tenant_id", "connection_id"],
            ["source_connections.tenant_id", "source_connections.id"],
        ),
        Index("ix_form_limits_expiry", "connection_id", "window_start"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    connection_id: Mapped[int] = mapped_column(BigInteger)
    ip_hash: Mapped[str] = mapped_column(String(64))
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    count: Mapped[int]


class CsvImport(Base):
    __tablename__ = "csv_imports"
    __table_args__ = (
        UniqueConstraint("tenant_id", "connection_id", "id"),
        UniqueConstraint("tenant_id", "connection_id", "idempotency_key"),
        ForeignKeyConstraint(
            ["tenant_id", "connection_id"],
            ["source_connections.tenant_id", "source_connections.id"],
        ),
        CheckConstraint("total_rows > 0 AND total_rows <= 1000"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    connection_id: Mapped[int] = mapped_column(BigInteger)
    idempotency_key: Mapped[str] = mapped_column(String(128))
    file_name: Mapped[str] = mapped_column(String(120))
    file_hash: Mapped[str] = mapped_column(String(64))
    total_rows: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
