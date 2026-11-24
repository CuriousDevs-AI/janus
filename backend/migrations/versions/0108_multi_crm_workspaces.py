"""Multi-CRM: crm_workspaces, crm_members, add crm_id to leads/deals/sources/targets/forms.

Revision ID: 0108
Revises: 0107
"""

from collections.abc import Sequence

import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "0108"
down_revision: str | None = "0107"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_STAGES = [
    {"key": "new", "label": "New", "color": "bg-slate-500", "probability": 10},
    {"key": "qualified", "label": "Qualified", "color": "bg-cyan-500", "probability": 20},
    {"key": "demo", "label": "Demo", "color": "bg-indigo-500", "probability": 40},
    {"key": "proposal", "label": "Proposal", "color": "bg-amber-500", "probability": 60},
    {"key": "negotiation", "label": "Negotiation", "color": "bg-orange-500", "probability": 75},
    {"key": "approval", "label": "Approval", "color": "bg-purple-500", "probability": 90},
    {"key": "won", "label": "Won", "color": "bg-emerald-500", "probability": 100},
    {"key": "lost", "label": "Lost", "color": "bg-red-500", "probability": 0},
]


def upgrade() -> None:
    # 1. Create crm_workspaces table
    op.create_table(
        "crm_workspaces",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("slug", sa.String(60), nullable=False),
        sa.Column("description", sa.String(1000), server_default=""),
        sa.Column("pipeline_stages", JSONB, nullable=False),
        sa.Column("win_stage", sa.String(40), server_default="won"),
        sa.Column("is_default", sa.Boolean, server_default="false"),
        sa.Column("active", sa.Boolean, server_default="true"),
        sa.Column("created_by", sa.BigInteger, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_crm_workspaces_tenant_slug"),
    )

    # 2. Create crm_members table
    op.create_table(
        "crm_members",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("crm_id", sa.BigInteger, sa.ForeignKey("crm_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("membership_id", sa.BigInteger, nullable=False),
        sa.Column("role", sa.String(20), server_default="member"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("crm_id", "membership_id", name="uq_crm_members_crm_membership"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "membership_id"],
            ["memberships.tenant_id", "memberships.id"],
            ondelete="CASCADE",
            name="fk_crm_members_membership",
        ),
        sa.CheckConstraint("role IN ('member', 'manager')", name="ck_crm_members_role"),
    )

    # 3. Create a default CRM workspace for every existing tenant
    conn = op.get_bind()
    tenants = conn.execute(sa.text("SELECT id FROM tenants")).fetchall()

    # Try to read existing pipeline stages from workspace_state store
    for (tenant_id,) in tenants:
        row = conn.execute(
            sa.text(
                "SELECT data FROM workspace_state "
                "WHERE tenant_id = :tid AND store_key = 'janus.pipeline.v1'"
            ),
            {"tid": tenant_id},
        ).fetchone()
        stages = DEFAULT_STAGES
        if row and row[0] and isinstance(row[0], dict):
            custom = row[0].get("stages")
            if custom and isinstance(custom, list) and len(custom) >= 2:
                stages = custom

        conn.execute(
            sa.text(
                "INSERT INTO crm_workspaces (tenant_id, name, slug, description, pipeline_stages, is_default, active) "
                "VALUES (:tid, 'Sales', 'sales', 'Default sales CRM', CAST(:stages AS jsonb), true, true)"
            ),
            {"tid": tenant_id, "stages": json.dumps(stages)},
        )

    # 4. Add crm_id columns (nullable first for backfill)
    op.add_column("leads", sa.Column("crm_id", sa.BigInteger, nullable=True))
    op.add_column("deals", sa.Column("crm_id", sa.BigInteger, nullable=True))
    op.add_column("crm_sales_targets", sa.Column("crm_id", sa.BigInteger, nullable=True))
    op.add_column("crm_web_forms", sa.Column("crm_id", sa.BigInteger, nullable=True))
    op.add_column("source_connections", sa.Column("crm_id", sa.BigInteger, nullable=True))

    # 5. Backfill crm_id from default CRM for each tenant
    conn.execute(
        sa.text(
            "UPDATE leads l SET crm_id = c.id "
            "FROM crm_workspaces c WHERE c.tenant_id = l.tenant_id AND c.is_default = true"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE deals d SET crm_id = c.id "
            "FROM crm_workspaces c WHERE c.tenant_id = d.tenant_id AND c.is_default = true"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE crm_sales_targets t SET crm_id = c.id "
            "FROM crm_workspaces c WHERE c.tenant_id = t.tenant_id AND c.is_default = true"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE crm_web_forms w SET crm_id = c.id "
            "FROM crm_workspaces c WHERE c.tenant_id = w.tenant_id AND c.is_default = true"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE source_connections s SET crm_id = c.id "
            "FROM crm_workspaces c WHERE c.tenant_id = s.tenant_id AND c.is_default = true"
        )
    )

    # 6. Make crm_id NOT NULL and add FK + indexes
    op.alter_column("leads", "crm_id", nullable=False)
    op.alter_column("deals", "crm_id", nullable=False)
    op.create_foreign_key("fk_leads_crm", "leads", "crm_workspaces", ["crm_id"], ["id"])
    op.create_foreign_key("fk_deals_crm", "deals", "crm_workspaces", ["crm_id"], ["id"])
    op.create_foreign_key("fk_sales_targets_crm", "crm_sales_targets", "crm_workspaces", ["crm_id"], ["id"])
    op.create_foreign_key("fk_web_forms_crm", "crm_web_forms", "crm_workspaces", ["crm_id"], ["id"])
    op.create_foreign_key("fk_source_connections_crm", "source_connections", "crm_workspaces", ["crm_id"], ["id"])
    op.create_index("ix_leads_tenant_crm", "leads", ["tenant_id", "crm_id"])
    op.create_index("ix_deals_tenant_crm", "deals", ["tenant_id", "crm_id"])

    # 7. Add crm_ids to invitations
    op.add_column("invitations", sa.Column("crm_ids", ARRAY(sa.BigInteger), server_default="{}"))


def downgrade() -> None:
    op.drop_column("invitations", "crm_ids")
    op.drop_index("ix_deals_tenant_crm", "deals")
    op.drop_index("ix_leads_tenant_crm", "leads")
    op.drop_constraint("fk_source_connections_crm", "source_connections", type_="foreignkey")
    op.drop_constraint("fk_web_forms_crm", "crm_web_forms", type_="foreignkey")
    op.drop_constraint("fk_sales_targets_crm", "crm_sales_targets", type_="foreignkey")
    op.drop_constraint("fk_deals_crm", "deals", type_="foreignkey")
    op.drop_constraint("fk_leads_crm", "leads", type_="foreignkey")
    op.drop_column("source_connections", "crm_id")
    op.drop_column("crm_web_forms", "crm_id")
    op.drop_column("crm_sales_targets", "crm_id")
    op.drop_column("deals", "crm_id")
    op.drop_column("leads", "crm_id")
    op.drop_table("crm_members")
    op.drop_table("crm_workspaces")
