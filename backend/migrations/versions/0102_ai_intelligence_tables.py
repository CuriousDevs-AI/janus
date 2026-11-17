"""AI intelligence tables: conversations, messages, knowledge, agents, memory.

Revision ID: 0102
Revises: 0101
"""

from collections.abc import Sequence

import logging

import sqlalchemy as sa
from alembic import op

log = logging.getLogger(__name__)

revision: str = "0102"
down_revision: str | None = "0101"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _try_vector() -> bool:
    conn = op.get_bind()
    try:
        conn.execute(sa.text("SAVEPOINT vector_check"))
        conn.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(sa.text("RELEASE SAVEPOINT vector_check"))
        return True
    except Exception:
        conn.execute(sa.text("ROLLBACK TO SAVEPOINT vector_check"))
        log.warning("pgvector not available — embedding columns skipped (install pgvector to enable RAG)")
        return False


def upgrade() -> None:
    has_vector = _try_vector()

    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("workspace_id", sa.String(40), nullable=True),
        sa.Column("title", sa.String(200)),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("stored", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "id", name="uq_ai_conversations_tenant"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ai_conversations_status_check"),
    )

    op.create_table(
        "ai_messages",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("conversation_id", sa.BigInteger, sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("metadata_", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('user', 'assistant', 'system')", name="ai_messages_role_check"),
    )

    op.create_table(
        "knowledge_collections",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("access_scope", sa.String(200), server_default="everyone"),
        sa.Column("created_by", sa.BigInteger, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "knowledge_sources",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("collection_id", sa.BigInteger, sa.ForeignKey("knowledge_collections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("content", sa.Text),
        sa.Column("file_path", sa.String(500)),
        sa.Column("url", sa.String(1000)),
        sa.Column("status", sa.String(20), nullable=False, server_default="processing"),
        sa.Column("access_scope", sa.String(200), server_default="everyone"),
        sa.Column("embedding_model", sa.String(60)),
        sa.Column("chunk_count", sa.Integer, server_default="0"),
        sa.Column("created_by", sa.BigInteger, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("type IN ('document', 'page', 'website', 'qa', 'app')", name="knowledge_sources_type_check"),
        sa.CheckConstraint("status IN ('processing', 'ready', 'failed', 'outdated', 'needs_review')", name="knowledge_sources_status_check"),
    )

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("source_id", sa.BigInteger, sa.ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("chunk_index", sa.Integer),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("token_count", sa.Integer),
        sa.Column("metadata_", sa.JSON),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    if has_vector:
        op.execute("ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(1536)")

    op.create_table(
        "ai_agents",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("scope", sa.String(40), server_default="business"),
        sa.Column("read_scopes", sa.JSON, server_default="[]"),
        sa.Column("actions", sa.JSON, server_default="[]"),
        sa.Column("approval_mode", sa.String(40), server_default="every_action"),
        sa.Column("system_prompt", sa.Text),
        sa.Column("model", sa.String(60)),
        sa.Column("trigger_config", sa.JSON),
        sa.Column("limits", sa.JSON),
        sa.Column("created_by", sa.BigInteger, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "key", name="uq_ai_agents_tenant_key"),
        sa.CheckConstraint("status IN ('draft', 'active', 'paused', 'archived')", name="ai_agents_status_check"),
    )

    op.create_table(
        "ai_agent_runs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("agent_id", sa.BigInteger, sa.ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("trigger_event", sa.JSON),
        sa.Column("result", sa.JSON),
        sa.Column("actions_taken", sa.Integer, server_default="0"),
        sa.Column("tokens_used", sa.Integer, server_default="0"),
        sa.Column("approved_by", sa.BigInteger, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("error", sa.Text),
        sa.CheckConstraint("status IN ('running', 'completed', 'failed', 'pending_approval', 'rejected')", name="ai_agent_runs_status_check"),
    )

    op.create_table(
        "ai_memory",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.BigInteger, nullable=True),
        sa.Column("workspace_id", sa.String(40), nullable=True),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("source", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("type IN ('preference', 'context', 'instruction', 'fact')", name="ai_memory_type_check"),
    )
    if has_vector:
        op.execute("ALTER TABLE ai_memory ADD COLUMN embedding vector(1536)")


def downgrade() -> None:
    op.drop_table("ai_memory")
    op.drop_table("ai_agent_runs")
    op.drop_table("ai_agents")
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_sources")
    op.drop_table("knowledge_collections")
    op.drop_table("ai_messages")
    op.drop_table("ai_conversations")
