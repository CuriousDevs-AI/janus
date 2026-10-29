"""Customer calls: phone calls logged against a contact, and one-time browser call links."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0039"
down_revision = "0038"


def upgrade() -> None:
    op.create_table(
        "customer_calls",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("contact_id", sa.BigInteger(), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("agent_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("outcome", sa.String(20)),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("notes", sa.Text(), server_default="", nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("guest_joined_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("method IN ('phone', 'browser')", name="ck_customer_calls_method"),
        sa.CheckConstraint(
            "direction IN ('outbound', 'inbound')", name="ck_customer_calls_direction"
        ),
        sa.CheckConstraint(
            "status IN ('logged', 'ringing', 'live', 'ended')", name="ck_customer_calls_status"
        ),
        sa.CheckConstraint(
            "outcome IS NULL OR outcome IN "
            "('connected', 'no_answer', 'busy', 'voicemail', 'wrong_number')",
            name="ck_customer_calls_outcome",
        ),
        sa.CheckConstraint(
            "duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400",
            name="ck_customer_calls_duration",
        ),
        sa.CheckConstraint(
            "(method = 'browser') = (token_hash IS NOT NULL)", name="ck_customer_calls_token"
        ),
    )
    op.create_index("ix_customer_calls_tenant_id", "customer_calls", ["tenant_id"])
    op.create_index("ix_customer_calls_contact_id", "customer_calls", ["contact_id"])
    op.create_table(
        "customer_call_signals",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "call_id",
            sa.BigInteger(),
            sa.ForeignKey("customer_calls.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("from_side", sa.String(5), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("from_side IN ('agent', 'guest')", name="ck_customer_call_signals_side"),
        sa.CheckConstraint(
            "kind IN ('offer', 'answer', 'ice', 'bye')", name="ck_customer_call_signals_kind"
        ),
    )
    op.create_index("ix_customer_call_signals_tenant_id", "customer_call_signals", ["tenant_id"])
    op.create_index("ix_customer_call_signals_call_id", "customer_call_signals", ["call_id"])
    for table in ("customer_calls", "customer_call_signals"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_access ON {table} USING (tenant_id = app_tenant()) "
            "WITH CHECK (tenant_id = app_tenant())"
        )
    # The customer has no account, so their link finds its company here, and only while it is open.
    op.execute("""CREATE FUNCTION public.customer_call_tenant(hashed_token text) RETURNS bigint
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      SELECT c.tenant_id FROM public.customer_calls c
      WHERE c.token_hash = hashed_token AND c.status IN ('ringing', 'live')
        AND c.expires_at > now()
    $$""")
    op.execute("REVOKE ALL ON FUNCTION public.customer_call_tenant(text) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.customer_call_tenant(text) TO janus_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION public.customer_call_tenant(text)")
    op.drop_table("customer_call_signals")
    op.drop_table("customer_calls")
