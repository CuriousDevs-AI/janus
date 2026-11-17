from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from janus_api.core.db import Base


class AICredential(Base):
    __tablename__ = "ai_credentials"
    __table_args__ = (
        UniqueConstraint("tenant_id", "provider"),
        CheckConstraint(
            "provider IN ('openai', 'anthropic', 'gemini', 'openai_compatible', 'openrouter',"
            " 'groq', 'cerebras', 'mistral', 'sambanova', 'github', 'nvidia', 'huggingface')",
            name="ai_credentials_provider_check",
        ),
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


class AIConversation(Base):
    __tablename__ = "ai_conversations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_ai_conversations_tenant"),
        CheckConstraint("status IN ('active', 'archived')", name="ai_conversations_status_check"),
    )
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(BigInteger, index=True)
    workspace_id: Mapped[str | None] = mapped_column(String(40))
    title: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="active")
    stored: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AIMessage(Base):
    __tablename__ = "ai_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant', 'system')", name="ai_messages_role_check"),
    )
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    metadata_: Mapped[dict | None] = mapped_column("metadata_", type_=sa.JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KnowledgeCollection(Base):
    __tablename__ = "knowledge_collections"
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    access_scope: Mapped[str] = mapped_column(String(200), default="everyone")
    created_by: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"
    __table_args__ = (
        CheckConstraint(
            "type IN ('document', 'page', 'website', 'qa', 'app')",
            name="knowledge_sources_type_check",
        ),
        CheckConstraint(
            "status IN ('processing', 'ready', 'failed', 'outdated', 'needs_review')",
            name="knowledge_sources_status_check",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    collection_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("knowledge_collections.id", ondelete="SET NULL")
    )
    type: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(300))
    content: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default="processing")
    access_scope: Mapped[str] = mapped_column(String(200), default="everyone")
    embedding_model: Mapped[str | None] = mapped_column(String(60))
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    source_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("knowledge_sources.id", ondelete="CASCADE"), index=True
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    chunk_index: Mapped[int | None] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    token_count: Mapped[int | None] = mapped_column(Integer)
    metadata_: Mapped[dict | None] = mapped_column("metadata_", type_=sa.JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AIAgent(Base):
    __tablename__ = "ai_agents"
    __table_args__ = (
        UniqueConstraint("tenant_id", "key", name="uq_ai_agents_tenant_key"),
        CheckConstraint(
            "status IN ('draft', 'active', 'paused', 'archived')",
            name="ai_agents_status_check",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    scope: Mapped[str] = mapped_column(String(40), default="business")
    read_scopes: Mapped[dict | None] = mapped_column(type_=sa.JSON, default=list)
    actions: Mapped[dict | None] = mapped_column(type_=sa.JSON, default=list)
    approval_mode: Mapped[str] = mapped_column(String(40), default="every_action")
    system_prompt: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String(60))
    trigger_config: Mapped[dict | None] = mapped_column(type_=sa.JSON)
    limits: Mapped[dict | None] = mapped_column(type_=sa.JSON)
    created_by: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AIAgentRun(Base):
    __tablename__ = "ai_agent_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'completed', 'failed', 'pending_approval', 'rejected')",
            name="ai_agent_runs_status_check",
        ),
    )
    agent_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ai_agents.id", ondelete="CASCADE"), index=True
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    status: Mapped[str] = mapped_column(String(20), default="running")
    trigger_event: Mapped[dict | None] = mapped_column(type_=sa.JSON)
    result: Mapped[dict | None] = mapped_column(type_=sa.JSON)
    actions_taken: Mapped[int] = mapped_column(Integer, default=0)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    approved_by: Mapped[int | None] = mapped_column(BigInteger)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)


class AIMemory(Base):
    __tablename__ = "ai_memory"
    __table_args__ = (
        CheckConstraint(
            "type IN ('preference', 'context', 'instruction', 'fact')",
            name="ai_memory_type_check",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(BigInteger)
    workspace_id: Mapped[str | None] = mapped_column(String(40))
    type: Mapped[str] = mapped_column(String(40))
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
