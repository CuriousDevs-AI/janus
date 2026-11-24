"""Grant janus_worker access to crm_workspaces for ensure_default_crm().

The capture() code path calls ensure_default_crm() which needs SELECT on
crm_workspaces, and potentially INSERT+UPDATE when creating the first default
workspace for a tenant.

Revision ID: 0110
Revises: 0109
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0110"
down_revision: str | None = "0109"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "GRANT SELECT, INSERT, UPDATE ON crm_workspaces TO janus_worker"
    )
    op.execute(
        "GRANT USAGE ON SEQUENCE crm_workspaces_id_seq TO janus_worker"
    )


def downgrade() -> None:
    op.execute("REVOKE SELECT, INSERT, UPDATE ON crm_workspaces FROM janus_worker")
    op.execute("REVOKE USAGE ON SEQUENCE crm_workspaces_id_seq FROM janus_worker")
