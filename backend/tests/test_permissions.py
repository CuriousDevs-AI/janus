import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from janus_api.core.db import session_factory
from janus_api.core.tenancy import set_context
from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


@pytest.mark.parametrize("role,expected", [("admin", 201), ("manager", 403), ("agent", 403)])
async def test_role_permissions(
    client: httpx.AsyncClient, mailbox: Mailbox, role: str, expected: int
) -> None:
    owner = await signup(client, mailbox)
    token = await invite(client, mailbox, owner, f"{role}@example.com", role)
    headers = await accept_new(client, token)
    me = (await client.get("/v1/me", headers=headers)).json()
    assert me["role"] == role and me["user"]["email_verified_at"]
    response = await client.post(
        "/v1/invitations", headers=headers, json={"email": "new@example.com", "role": "agent"}
    )
    assert response.status_code == expected, response.text
    assert (
        await client.post(
            "/v1/invitations",
            headers=headers,
            json={"email": "another-owner@example.com", "role": "owner"},
        )
    ).status_code == 403


async def test_rls_denies_cross_tenant_reads_and_writes(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
) -> None:
    first = await signup(client, mailbox, "first@example.com")
    second = await signup(client, mailbox, "second@example.com")
    await invite(client, mailbox, second, "invitee@example.com")
    async with admin_engine.connect() as admin:
        rows = (
            await admin.execute(
                text("""SELECT relname, relrowsecurity, relforcerowsecurity
            FROM pg_class WHERE relname IN
            ('tenants', 'memberships', 'roles', 'sessions', 'invitations', 'audit_log',
             'teams', 'team_members', 'whatsapp_connections',
             'whatsapp_conversations', 'whatsapp_messages', 'deals')""")
            )
        ).all()
        assert len(rows) == 12 and all(
            row.relrowsecurity and row.relforcerowsecurity for row in rows
        )
        identities = (
            await admin.execute(
                text("""SELECT table_name FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'id'
              AND identity_generation = 'ALWAYS' """)
            )
        ).all()
        # One identity id per model table; push subscriptions are the newest.
        assert len(identities) == 80
    async with session_factory()() as db:
        await set_context(db, tenant_id=first.tenant_id, user_id=first.user_id)
        for table in ["memberships", "invitations", "audit_log"]:
            assert not (
                await db.execute(
                    text(f"SELECT id FROM {table} WHERE tenant_id = :tenant"),
                    {"tenant": second.tenant_id},
                )
            ).all()
        assert not (
            await db.execute(
                text("SELECT id FROM tenants WHERE id = :tenant"), {"tenant": second.tenant_id}
            )
        ).all()
        assert not (
            await db.execute(
                text("SELECT id FROM sessions WHERE user_id = :user"), {"user": second.user_id}
            )
        ).all()
        assert not (
            await db.execute(
                text("UPDATE tenants SET name = 'ATTACK' WHERE id = :tenant RETURNING id"),
                {"tenant": second.tenant_id},
            )
        ).all()
        with pytest.raises(DBAPIError):
            await db.execute(
                text(
                    "INSERT INTO roles (tenant_id, name, permissions) VALUES (:tenant, 'bad', '{}')"
                ),
                {"tenant": second.tenant_id},
            )
        await db.rollback()
        await set_context(db, tenant_id=first.tenant_id, user_id=first.user_id)
        with pytest.raises(DBAPIError):
            await db.execute(text("DELETE FROM audit_log"))
        await db.rollback()
        assert not (await db.execute(text("SELECT id FROM tenants"))).all()
    async with session_factory()() as db:
        # System roles are readable but cannot be changed by the application.
        assert await db.scalar(text("SELECT count(*) FROM roles WHERE tenant_id IS NULL")) == 4
        assert not (
            await db.execute(
                text("UPDATE roles SET permissions = '{}' WHERE tenant_id IS NULL RETURNING id")
            )
        ).all()
