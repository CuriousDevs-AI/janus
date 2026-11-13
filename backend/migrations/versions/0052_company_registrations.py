"""Each company's registration details, and the acknowledgement number of a filing.

The details (entity type, CIN or LLPIN, PAN, TAN, EPF and ESI codes, professional tax state, Udyam
number, date of incorporation, registered address and directors) say which filings apply and
which details are missing. They are per company under row-level security, like the compliance
plan. A filing marked done can now keep the acknowledgement number the portal gave.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0052"
down_revision = "0051"

ENTITY_TYPES = ("pvt_ltd", "public_ltd", "opc", "llp", "partnership", "proprietorship", "other")


def upgrade() -> None:
    op.create_table(
        "company_registrations",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("entity_type", sa.String(20)),
        sa.Column("legal_name", sa.String(160)),
        sa.Column("cin", sa.String(21)),
        sa.Column("pan", sa.String(10)),
        sa.Column("tan", sa.String(10)),
        sa.Column("epf_code", sa.String(30)),
        sa.Column("esi_code", sa.String(30)),
        sa.Column("pt_state", sa.String(2)),
        sa.Column("udyam", sa.String(30)),
        sa.Column("incorporated_on", sa.Date()),
        sa.Column("registered_address", sa.String(400)),
        sa.Column(
            "directors",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("updated_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id"),
        sa.CheckConstraint(
            "entity_type IS NULL OR entity_type IN ("
            + ", ".join(f"'{kind}'" for kind in ENTITY_TYPES)
            + ")",
            name="ck_registrations_entity_type",
        ),
        sa.CheckConstraint(
            "pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'", name="ck_registrations_pan"
        ),
        sa.CheckConstraint(
            "tan IS NULL OR tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'", name="ck_registrations_tan"
        ),
    )
    op.execute("ALTER TABLE company_registrations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE company_registrations FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_access ON company_registrations "
        "USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON company_registrations TO janus_app")
    op.add_column("compliance_filings", sa.Column("acknowledgement", sa.String(60)))


def downgrade() -> None:
    op.drop_column("compliance_filings", "acknowledgement")
    op.drop_table("company_registrations")
