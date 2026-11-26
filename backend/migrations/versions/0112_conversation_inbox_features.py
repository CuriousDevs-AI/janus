"""Add status, assignment, notes, tags, and quick replies for conversations.

Revision ID: 0112
Revises: 0111
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0112"
down_revision: str | None = "0111"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "whatsapp_conversations",
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
    )
    op.add_column(
        "whatsapp_conversations",
        sa.Column("assigned_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "whatsapp_conversations",
        sa.Column("unread_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "whatsapp_conversations",
        sa.Column("priority", sa.String(10), server_default="normal", nullable=False),
    )
    op.add_column(
        "whatsapp_conversations",
        sa.Column("last_message_body", sa.String(200), nullable=True),
    )
    op.create_index(
        "ix_whatsapp_conversations_assigned",
        "whatsapp_conversations",
        ["tenant_id", "assigned_user_id"],
    )

    op.create_table(
        "conversation_notes",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=False, index=True),
        sa.Column("conversation_id", sa.BigInteger(), nullable=False, index=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.String(4000), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "conversation_tags",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=False, index=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("color", sa.String(20), server_default="gray", nullable=False),
        sa.UniqueConstraint("tenant_id", "name"),
    )

    op.create_table(
        "conversation_tag_links",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=False),
        sa.Column("conversation_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "tag_id",
            sa.BigInteger(),
            sa.ForeignKey("conversation_tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("conversation_id", "tag_id"),
    )
    op.create_index(
        "ix_conversation_tag_links_conv",
        "conversation_tag_links",
        ["conversation_id"],
    )

    op.create_table(
        "quick_replies",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=False, index=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("body", sa.String(4096), nullable=False),
        sa.Column("shared", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("quick_replies")
    op.drop_table("conversation_tag_links")
    op.drop_table("conversation_tags")
    op.drop_table("conversation_notes")
    op.drop_index("ix_whatsapp_conversations_assigned", "whatsapp_conversations")
    op.drop_column("whatsapp_conversations", "last_message_body")
    op.drop_column("whatsapp_conversations", "priority")
    op.drop_column("whatsapp_conversations", "unread_count")
    op.drop_column("whatsapp_conversations", "assigned_user_id")
    op.drop_column("whatsapp_conversations", "status")
