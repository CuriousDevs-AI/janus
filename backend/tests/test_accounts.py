from io import BytesIO

import httpx
from PIL import Image
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import PASSWORD, accept_new, invite, login, signup


async def test_profile_and_email_change(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    account = await signup(client, mailbox)
    profile = {
        "name": "Asha Shah",
        "phone": "+919876543210",
        "timezone": "Asia/Kolkata",
        "language": "hi",
    }
    response = await client.patch("/v1/me", headers=account.headers, json=profile)
    assert response.status_code == 200, response.text
    assert all(response.json()[key] == value for key, value in profile.items())
    assert (
        await client.patch("/v1/me", headers=account.headers, json={"timezone": "Invalid/Zone"})
    ).status_code == 422
    assert (
        await client.patch("/v1/me", headers=account.headers, json={"name": None})
    ).status_code == 422
    response = await client.post(
        "/v1/me/change-email",
        headers=account.headers,
        json={"new_email": "asha@example.com", "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    assert (await client.get("/v1/me", headers=account.headers)).json()["user"][
        "email"
    ] == account.email
    token = mailbox.token("asha@example.com", "change-email")
    assert (await client.post("/v1/auth/verify-email", json={"token": token})).status_code == 200
    assert (await client.post("/v1/auth/verify-email", json={"token": token})).status_code == 400
    assert (await client.get("/v1/me", headers=account.headers)).status_code == 401
    old_login = await client.post(
        "/v1/auth/login", json={"email": account.email, "password": PASSWORD}
    )
    assert old_login.status_code == 401
    await login(client, "asha@example.com")


async def test_avatar_validation_and_unconfigured_storage(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    account = await signup(client, mailbox)
    for data, expected in [(b"not an image", 422), (b"x" * (2 * 1024 * 1024 + 1), 413)]:
        result = await client.post(
            "/v1/me/avatar",
            headers=account.headers,
            files={"file": ("photo.png", data, "image/png")},
        )
        assert result.status_code == expected, result.text
    buffer = BytesIO()
    Image.new("RGB", (10, 10), "blue").save(buffer, format="PNG")
    result = await client.post(
        "/v1/me/avatar",
        headers=account.headers,
        files={"file": ("photo.png", buffer.getvalue(), "image/png")},
    )
    assert result.status_code == 503
    assert result.json()["error"]["code"] == "storage_unavailable"


async def test_delete_account_requires_password_and_another_owner(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
) -> None:
    owner = await signup(client, mailbox)
    assert (
        await client.request(
            "DELETE", "/v1/me", headers=owner.headers, json={"password": "wrong-value"}
        )
    ).status_code == 400
    response = await client.request(
        "DELETE", "/v1/me", headers=owner.headers, json={"password": PASSWORD}
    )
    assert response.status_code == 409 and response.json()["error"]["code"] == "last_owner"
    token = await invite(client, mailbox, owner, "second@example.com", "owner")
    second = await accept_new(client, token)
    assert (
        await client.request("DELETE", "/v1/me", headers=owner.headers, json={"password": PASSWORD})
    ).status_code == 200
    assert (await client.get("/v1/me", headers=owner.headers)).status_code == 401
    assert (await client.get("/v1/me", headers=second)).status_code == 200
    assert (
        await client.post("/v1/auth/login", json={"email": owner.email, "password": PASSWORD})
    ).status_code == 401


async def test_disabled_membership_rejects_access_and_refresh(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
) -> None:
    owner = await signup(client, mailbox)
    token = await invite(client, mailbox, owner, "agent@example.com")
    await accept_new(client, token)
    member = await login(client, "agent@example.com")
    async with admin_engine.connect() as db:
        member_id = await db.scalar(
            text("SELECT id FROM memberships WHERE user_id = :user"), {"user": member.user_id}
        )
    response = await client.patch(
        f"/v1/members/{member_id}", headers=owner.headers, json={"status": "disabled"}
    )
    assert response.status_code == 200, response.text
    assert (await client.get("/v1/me", headers=member.headers)).status_code == 403
    assert (
        await client.post("/v1/auth/refresh", json={"refresh_token": member.refresh})
    ).status_code == 403
    assert (
        await client.patch(
            f"/v1/members/{member_id}", headers=owner.headers, json={"status": "active"}
        )
    ).status_code == 200
    assert (await client.get("/v1/me", headers=member.headers)).status_code == 200


async def test_switch_tenant_existing_invitee_and_single_use(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    first = await signup(client, mailbox, "first@example.com")
    second = await signup(client, mailbox, "second@example.com")
    response = await client.post(
        "/v1/me/switch-tenant", headers=first.headers, json={"tenant_id": second.tenant_id}
    )
    assert response.status_code == 403
    token = await invite(client, mailbox, second, first.email)
    details = await client.get(f"/v1/invitations/{token}")
    assert details.status_code == 200 and details.json()["role"] == "agent"
    assert (await client.post(f"/v1/invitations/{token}/accept", json={})).status_code == 401
    assert (
        await client.post(f"/v1/invitations/{token}/accept", headers=second.headers, json={})
    ).status_code == 401
    response = await client.post(f"/v1/invitations/{token}/accept", headers=first.headers, json={})
    assert response.status_code == 200, response.text
    assert (await client.get(f"/v1/invitations/{token}")).status_code == 400
    assert (
        await client.post(f"/v1/invitations/{token}/accept", headers=first.headers, json={})
    ).status_code == 400
    me = (await client.get("/v1/me", headers=first.headers)).json()
    assert len(me["tenants"]) == 2
    switched = await client.post(
        "/v1/me/switch-tenant", headers=first.headers, json={"tenant_id": second.tenant_id}
    )
    assert switched.status_code == 200, switched.text
    headers = {"Authorization": f"Bearer {switched.json()['access_token']}"}
    me = (await client.get("/v1/me", headers=headers)).json()
    assert me["tenant"]["id"] == str(second.tenant_id) and me["role"] == "agent"
    assert (await client.get("/v1/me", headers=first.headers)).status_code == 401


async def test_expired_invitation_cannot_create_account(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
) -> None:
    owner = await signup(client, mailbox)
    token = await invite(client, mailbox, owner, "invitee@example.com")
    async with admin_engine.begin() as db:
        await db.execute(text("UPDATE invitations SET expires_at = now() - interval '1 second'"))
    assert (await client.get(f"/v1/invitations/{token}")).status_code == 400
    response = await client.post(
        f"/v1/invitations/{token}/accept", json={"name": "Invitee", "password": PASSWORD}
    )
    assert response.status_code == 400
    async with admin_engine.connect() as db:
        assert (
            await db.scalar(text("SELECT count(*) FROM users WHERE email = 'invitee@example.com'"))
            == 0
        )
