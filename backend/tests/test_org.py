import asyncio

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from janus_api.core.db import session_factory
from janus_api.core.tenancy import set_context
from tests.conftest import Mailbox
from tests.helpers import PASSWORD, accept_new, invite, signup


async def test_workspace_settings_match_frontend_fields(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    other = await signup(client, mailbox, "other@example.com")
    initial = (await client.get("/v1/tenant", headers=owner.headers)).json()
    assert initial["defaultChannel"] == "whatsapp" and initial["industry"] == ""
    fields = {
        "name": "Pune Traders",
        "industry": "Manufacturing",
        "companySize": "11-50",
        "timezone": "UTC",
        "businessHours": {"start": "22:00", "end": "06:00"},
        "defaultChannel": "website_chat",
    }
    response = await client.patch("/v1/tenant", headers=owner.headers, json=fields)
    assert response.status_code == 200, response.text
    assert all(response.json()[key] == value for key, value in fields.items())
    me = (await client.get("/v1/me", headers=owner.headers)).json()
    assert me["tenant"]["name"] == "Pune Traders" and me["tenant"]["timezone"] == "UTC"
    assert (await client.get("/v1/tenant", headers=other.headers)).json()[
        "name"
    ] == "Mumbai Traders"
    for invalid in [
        {},
        {"name": "   "},
        {"timezone": "Not/AZone"},
        {"name": None},
        {"businessHours": {"start": "25:00", "end": "06:00"}},
        {"businessHours": {"start": "09:00", "end": "09:00"}},
        {"plan": "enterprise"},
        {"tenant_id": other.tenant_id, "name": "Other"},
    ]:
        assert (
            await client.patch("/v1/tenant", headers=owner.headers, json=invalid)
        ).status_code == 422


async def test_members_roles_live_permissions_and_last_owner(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    token = await invite(client, mailbox, owner, "agent@example.com")
    agent = await accept_new(client, token)
    roles = (await client.get("/v1/roles", headers=agent)).json()
    assert {r["name"] for r in roles} == {"owner", "admin", "manager", "agent"}
    members = (await client.get("/v1/members", headers=owner.headers)).json()
    owner_id = next(m["id"] for m in members if m["email"] == owner.email)
    agent_id = next(m["id"] for m in members if m["email"] == "agent@example.com")
    assert all("password_hash" not in member for member in members)
    result = await client.patch(
        f"/v1/members/{agent_id}", headers=owner.headers, json={"role": "admin"}
    )
    assert result.status_code == 200 and result.json()["role"] == "admin"
    # The original JWT picks up current permissions without a refresh.
    assert (await client.get("/v1/members", headers=agent)).status_code == 200
    assert (
        await client.patch(f"/v1/members/{agent_id}", headers=agent, json={"role": "owner"})
    ).status_code == 403
    assert (
        await client.patch(f"/v1/members/{owner_id}", headers=agent, json={"status": "disabled"})
    ).status_code == 403
    for patch in [
        {"role": "agent"},
        {"status": "disabled"},
        {"role": "admin", "status": "disabled"},
    ]:
        assert (
            await client.patch(f"/v1/members/{owner_id}", headers=owner.headers, json=patch)
        ).status_code == 409
    assert (
        await client.patch(f"/v1/members/{agent_id}", headers=owner.headers, json={"role": "owner"})
    ).status_code == 200
    assert (
        await client.patch(f"/v1/members/{owner_id}", headers=owner.headers, json={"role": "agent"})
    ).status_code == 200
    assert (await client.get("/v1/members", headers=owner.headers)).status_code == 403
    assert (await client.get("/v1/me", headers=owner.headers)).json()["role"] == "agent"


async def test_concurrent_owner_demotion_retains_one_owner(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    first = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, first, "second@example.com", "owner")
    )
    members = (await client.get("/v1/members", headers=first.headers)).json()
    responses = await asyncio.gather(
        *[
            client.patch(
                f"/v1/members/{member['id']}",
                headers=first.headers if member["email"] == first.email else second,
                json={"role": "agent"},
            )
            for member in members
        ]
    )
    assert sorted(r.status_code for r in responses) == [200, 409]


async def test_deleted_member_cannot_be_reactivated(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    members = (await client.get("/v1/members", headers=owner.headers)).json()
    agent_id = next(m["id"] for m in members if m["email"] == "agent@example.com")
    assert (
        await client.request("DELETE", "/v1/me", headers=agent, json={"password": PASSWORD})
    ).status_code == 200
    response = await client.patch(
        f"/v1/members/{agent_id}", headers=owner.headers, json={"status": "active"}
    )
    assert response.status_code == 409 and response.json()["error"]["code"] == "account_deleted"


async def test_invitation_list_resend_revoke(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    token = await invite(client, mailbox, owner, "pending@example.com")
    invitations = (await client.get("/v1/invitations", headers=owner.headers)).json()
    assert len(invitations) == 1 and invitations[0]["email"] == "pending@example.com"
    assert "token_hash" not in invitations[0] and token not in str(invitations)
    invitation_id = invitations[0]["id"]
    duplicate = await client.post(
        "/v1/invitations",
        headers=owner.headers,
        json={"email": "PENDING@example.com", "role": "agent"},
    )
    assert duplicate.status_code == 409
    assert (
        await client.post(f"/v1/invitations/{invitation_id}/resend", headers=owner.headers)
    ).status_code == 429
    async with admin_engine.begin() as db:
        await db.execute(text("UPDATE invitations SET last_sent_at = now() - interval '2 minutes'"))
    assert (
        await client.post(f"/v1/invitations/{invitation_id}/resend", headers=owner.headers)
    ).status_code == 200
    replacement = mailbox.token("pending@example.com", "invite")
    assert replacement != token
    assert (await client.get(f"/v1/invitations/{token}")).status_code == 400
    assert (await client.get(f"/v1/invitations/{replacement}")).status_code == 200
    assert (
        await client.delete(f"/v1/invitations/{invitation_id}", headers=owner.headers)
    ).status_code == 200
    assert (await client.get(f"/v1/invitations/{replacement}")).status_code == 400
    assert (
        await client.post(
            f"/v1/invitations/{replacement}/accept", json={"name": "Invitee", "password": PASSWORD}
        )
    ).status_code == 400
    assert (await client.get("/v1/invitations", headers=owner.headers)).json() == []
    assert (
        await client.post(f"/v1/invitations/{invitation_id}/resend", headers=owner.headers)
    ).status_code == 404
    # Revocation permits a fresh invite, whose token is also single-use under concurrency.
    fresh = await invite(client, mailbox, owner, "pending@example.com")
    responses = await asyncio.gather(
        *[
            client.post(
                f"/v1/invitations/{fresh}/accept", json={"name": "Invitee", "password": PASSWORD}
            )
            for _ in range(2)
        ]
    )
    assert sorted(r.status_code for r in responses) == [200, 400]
    duplicate = await client.post(
        "/v1/invitations",
        headers=owner.headers,
        json={"email": "pending@example.com", "role": "agent"},
    )
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "already_member"


async def test_teams_lifecycle_and_disabled_members(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    members = (await client.get("/v1/members", headers=owner.headers)).json()
    member_id = next(m["id"] for m in members if m["email"] == "agent@example.com")
    created = await client.post(
        "/v1/teams", headers=owner.headers, json={"name": " Sales ", "description": "West region"}
    )
    assert created.status_code == 201, created.text
    team = created.json()
    assert team["name"] == "Sales" and team["member_count"] == 0
    assert (
        await client.post("/v1/teams", headers=owner.headers, json={"name": "sales"})
    ).status_code == 409
    link = f"/v1/teams/{team['id']}/members/{member_id}"
    for _ in range(2):
        assert (await client.put(link, headers=owner.headers)).status_code == 204
    assert (await client.get("/v1/teams", headers=owner.headers)).json()[0]["member_count"] == 1
    roster = await client.get(f"/v1/teams/{team['id']}/members", headers=owner.headers)
    assert len(roster.json()) == 1 and roster.json()[0]["id"] == member_id
    await client.patch(
        f"/v1/members/{member_id}", headers=owner.headers, json={"status": "disabled"}
    )
    assert (await client.get("/v1/teams", headers=owner.headers)).json()[0]["member_count"] == 0
    assert (await client.get(f"/v1/teams/{team['id']}/members", headers=owner.headers)).json() == []
    assert (await client.put(link, headers=owner.headers)).status_code == 409
    await client.patch(f"/v1/members/{member_id}", headers=owner.headers, json={"status": "active"})
    renamed = await client.patch(
        f"/v1/teams/{team['id']}",
        headers=owner.headers,
        json={"name": "West Sales", "description": ""},
    )
    assert renamed.status_code == 200 and renamed.json()["member_count"] == 1
    assert (await client.delete(link, headers=owner.headers)).status_code == 204
    assert (await client.put(link, headers=owner.headers)).status_code == 204
    assert (
        await client.delete(f"/v1/teams/{team['id']}", headers=owner.headers)
    ).status_code == 204
    assert (await client.get("/v1/teams", headers=owner.headers)).json() == []
    async with admin_engine.connect() as db:
        assert await db.scalar(text("SELECT count(*) FROM team_members")) == 0
        actions = set((await db.scalars(text("SELECT action FROM audit_log"))).all())
        assert {
            "team.created",
            "team.updated",
            "team.deleted",
            "team.member_added",
            "team.member_removed",
        } <= actions


@pytest.mark.parametrize("role", ["manager", "agent"])
async def test_org_write_permissions(
    client: httpx.AsyncClient, mailbox: Mailbox, role: str
) -> None:
    owner = await signup(client, mailbox)
    headers = await accept_new(
        client, await invite(client, mailbox, owner, f"{role}@example.com", role)
    )
    assert (await client.get("/v1/teams", headers=headers)).status_code == 200
    assert (await client.get("/v1/tenant", headers=headers)).status_code == 200
    assert (await client.get("/v1/members", headers=headers)).status_code == 403
    assert (await client.get("/v1/invitations", headers=headers)).status_code == 403
    assert (
        await client.post("/v1/teams", headers=headers, json={"name": "Team"})
    ).status_code == 403
    assert (
        await client.patch("/v1/tenant", headers=headers, json={"name": "Changed"})
    ).status_code == 403


async def test_teams_and_invites_cannot_cross_tenants(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    first = await signup(client, mailbox)
    second = await signup(client, mailbox, "other@example.com")
    a = (await client.post("/v1/teams", headers=first.headers, json={"name": "Sales"})).json()
    b = (await client.post("/v1/teams", headers=second.headers, json={"name": "Sales"})).json()
    ma = (await client.get("/v1/members", headers=first.headers)).json()[0]["id"]
    mb = (await client.get("/v1/members", headers=second.headers)).json()[0]["id"]
    await client.put(f"/v1/teams/{b['id']}/members/{mb}", headers=second.headers)
    await invite(client, mailbox, second, "pending@example.com")
    invitation_id = (await client.get("/v1/invitations", headers=second.headers)).json()[0]["id"]
    assert (await client.get("/v1/invitations", headers=first.headers)).json() == []
    assert (
        await client.delete(f"/v1/invitations/{invitation_id}", headers=first.headers)
    ).status_code == 404
    assert (
        await client.get(f"/v1/teams/{b['id']}/members", headers=first.headers)
    ).status_code == 404
    assert (
        await client.patch(f"/v1/teams/{b['id']}", headers=first.headers, json={"name": "Attack"})
    ).status_code == 404
    assert (await client.delete(f"/v1/teams/{b['id']}", headers=first.headers)).status_code == 404
    assert (
        await client.put(f"/v1/teams/{a['id']}/members/{mb}", headers=first.headers)
    ).status_code == 404
    async with session_factory()() as db:
        await set_context(db, tenant_id=first.tenant_id, user_id=first.user_id)
        assert not (
            await db.execute(
                text("SELECT id FROM teams WHERE tenant_id=:tenant"), {"tenant": second.tenant_id}
            )
        ).all()
        assert not (
            await db.execute(
                text("SELECT id FROM team_members WHERE tenant_id=:tenant"),
                {"tenant": second.tenant_id},
            )
        ).all()
        assert not (
            await db.execute(
                text("UPDATE teams SET name='Attack' WHERE id=:id RETURNING id"),
                {"id": int(b["id"])},
            )
        ).all()
        for tenant, team, member in [
            (first.tenant_id, b["id"], ma),
            (first.tenant_id, a["id"], mb),
            (second.tenant_id, b["id"], mb),
        ]:
            with pytest.raises(DBAPIError):
                await db.execute(
                    text(
                        "INSERT INTO team_members (tenant_id,team_id,membership_id) "
                        "VALUES (:tenant,:team,:member)"
                    ),
                    {"tenant": tenant, "team": int(team), "member": int(member)},
                )
            await db.rollback()
            await set_context(db, tenant_id=first.tenant_id, user_id=first.user_id)


async def test_expired_invite_resend_cannot_duplicate_pending_invite(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
) -> None:
    owner = await signup(client, mailbox)
    await invite(client, mailbox, owner, "pending@example.com")
    old = (await client.get("/v1/invitations", headers=owner.headers)).json()[0]["id"]
    async with admin_engine.begin() as db:
        await db.execute(
            text(
                "UPDATE invitations SET expires_at=now()-interval '1 hour', "
                "last_sent_at=now()-interval '1 hour'"
            )
        )
    await invite(client, mailbox, owner, "pending@example.com")
    result = await client.post(f"/v1/invitations/{old}/resend", headers=owner.headers)
    assert result.status_code == 409 and result.json()["error"]["code"] == "invitation_pending"
    assert len((await client.get("/v1/invitations", headers=owner.headers)).json()) == 1


async def test_delete_rechecks_ownership_after_cached_role_change(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
) -> None:
    from sqlalchemy import select

    from janus_api.core.errors import ApiError
    from janus_api.org import service
    from janus_api.org.models import Membership

    owner = await signup(client, mailbox)
    headers = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    agent_id = int((await client.get("/v1/me", headers=headers)).json()["user"]["id"])
    async with session_factory()() as db:
        await set_context(db, user_id=agent_id, tenant_id=owner.tenant_id)
        cached = await db.scalar(select(Membership).where(Membership.user_id == agent_id))
        assert cached is not None
        old_role = cached.role_id
        async with admin_engine.begin() as admin:
            await admin.execute(
                text("""UPDATE memberships SET role_id=(
                SELECT id FROM roles WHERE name=CASE
                  WHEN user_id=:agent THEN 'owner' ELSE 'agent' END
                AND tenant_id IS NULL) WHERE tenant_id=:tenant"""),
                {"agent": agent_id, "tenant": owner.tenant_id},
            )
        assert cached.role_id == old_role
        with pytest.raises(ApiError) as error:
            await service.disable_memberships_for_deletion(db, agent_id)
        assert error.value.code == "last_owner"


async def test_pagination_and_unverified_org_writes(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox, verify=False)
    assert (
        await client.post("/v1/teams", headers=owner.headers, json={"name": "Sales"})
    ).status_code == 403
    await client.post(
        "/v1/auth/verify-email", json={"token": mailbox.token(owner.email, "verify-email")}
    )
    for name in ["Sales", "Support"]:
        assert (
            await client.post("/v1/teams", headers=owner.headers, json={"name": name})
        ).status_code == 201
    page = (await client.get("/v1/teams?limit=1", headers=owner.headers)).json()
    assert len(page) == 1 and page[0]["name"] == "Sales"
    next_page = (
        await client.get(f"/v1/teams?limit=1&after_id={page[0]['id']}", headers=owner.headers)
    ).json()
    assert len(next_page) == 1 and next_page[0]["name"] == "Support"
    assert (await client.get("/v1/teams?limit=101", headers=owner.headers)).status_code == 422
