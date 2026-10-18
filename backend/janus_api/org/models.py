from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
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


class Tenant(Base):
    __tablename__ = "tenants"
    name: Mapped[str] = mapped_column(String(160))
    timezone: Mapped[str] = mapped_column(default="Asia/Kolkata")
    industry: Mapped[str] = mapped_column(String(120), server_default="")
    company_size: Mapped[str] = mapped_column(String(80), server_default="")
    business_hours: Mapped[dict[str, str]] = mapped_column(
        JSONB, server_default=text('\'{"start":"09:00","end":"18:00"}\'::jsonb')
    )
    default_channel: Mapped[str] = mapped_column(String(20), server_default="whatsapp")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("tenant_id", "name", postgresql_nulls_not_distinct=True),)
    tenant_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(80))
    permissions: Mapped[list[str]] = mapped_column(ARRAY(String))


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id"),
        UniqueConstraint("tenant_id", "id", name="uq_membership_tenant_id"),
        CheckConstraint("status IN ('active', 'disabled')"),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    role_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("roles.id"))
    status: Mapped[str] = mapped_column(default="active")


class Invitation(Base):
    __tablename__ = "invitations"
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    email: Mapped[str] = mapped_column(String(320))
    role_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("roles.id"))
    inviter_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_team_tenant_id"),
        Index("uq_team_tenant_name", "tenant_id", func.lower(text("name")), unique=True),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (
        UniqueConstraint("team_id", "membership_id", name="uq_team_membership"),
        ForeignKeyConstraint(
            ["tenant_id", "team_id"],
            ["teams.tenant_id", "teams.id"],
            ondelete="CASCADE",
            name="fk_team_member_team",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "membership_id"],
            ["memberships.tenant_id", "memberships.id"],
            ondelete="CASCADE",
            name="fk_team_member_membership",
        ),
    )
    tenant_id: Mapped[int] = mapped_column(BigInteger, index=True)
    team_id: Mapped[int] = mapped_column(BigInteger)
    membership_id: Mapped[int] = mapped_column(BigInteger, index=True)
