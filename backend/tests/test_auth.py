import asyncio
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from janus_api.core.security import digest, now
from tests.conftest import Mailbox
from tests.helpers import NEW_PASSWORD, PASSWORD, login, signup


async def test_signup_verify_refresh_logout(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    account = await signup(client, mailbox, verify=False)
    token = mailbox.token(account.email, "verify-email")
    async with admin_engine.connect() as db:
        row = (await db.execute(text("SELECT password_hash FROM users"))).one()
        assert row.password_hash.startswith("$argon2id$")
        assert await db.scalar(text("SELECT token_hash FROM email_verifications")) == digest(token)
        assert await db.scalar(text("SELECT refresh_hash FROM sessions")) == digest(account.refresh)
    me = (await client.get("/v1/me", headers=account.headers)).json()
    assert me["role"] == "owner" and "sources:manage" in me["permissions"]
    assert me["user"]["email_verified_at"] is None
    assert (
        await client.post(
            "/v1/invitations",
            headers=account.headers,
            json={"email": "member@example.com", "role": "agent"},
        )
    ).status_code == 403
    assert (await client.post("/v1/auth/verify-email", json={"token": token})).status_code == 200
    assert (await client.post("/v1/auth/verify-email", json={"token": token})).status_code == 400
    pair = await client.post("/v1/auth/refresh", json={"refresh_token": account.refresh})
    assert pair.status_code == 200, pair.text
    assert pair.json()["refresh_token"] != account.refresh
    assert (
        await client.post("/v1/auth/refresh", json={"refresh_token": account.refresh})
    ).status_code == 401
    headers = {"Authorization": f"Bearer {pair.json()['access_token']}"}
    assert (await client.post("/v1/auth/logout", headers=headers)).status_code == 200
    assert (await client.get("/v1/me", headers=headers)).status_code == 401
    assert (
        await client.post("/v1/auth/refresh", json={"refresh_token": pair.json()["refresh_token"]})
    ).status_code == 401
    async with admin_engine.connect() as db:
        actions = set((await db.scalars(text("SELECT action FROM audit_log"))).all())
        assert {
            "auth.signup",
            "auth.email_verified",
            "auth.login",
            "auth.refresh",
            "auth.logout",
        } <= actions


async def test_concurrent_refresh_only_one_wins(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    account = await signup(client, mailbox)
    results = await asyncio.gather(
        *[
            client.post("/v1/auth/refresh", json={"refresh_token": account.refresh})
            for _ in range(2)
        ]
    )
    assert sorted(r.status_code for r in results) == [200, 401]


async def test_session_revocation(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    first = await signup(client, mailbox)
    second = await login(client, first.email)
    sessions = (await client.get("/v1/auth/sessions", headers=first.headers)).json()
    assert len(sessions) == 2
    other = next(s for s in sessions if not s["current"])
    assert other["device"] == "Janus tests" and other["ip"] == "127.0.0.1"
    assert (
        await client.delete(f"/v1/auth/sessions/{other['id']}", headers=first.headers)
    ).status_code == 200
    assert (await client.get("/v1/me", headers=second.headers)).status_code == 401
    third = await login(client, first.email)
    assert (await client.post("/v1/auth/logout-all", headers=first.headers)).status_code == 200
    for account in [first, third]:
        assert (await client.get("/v1/me", headers=account.headers)).status_code == 401


async def test_reset_password_generic_response_and_revocation(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
) -> None:
    first = await signup(client, mailbox)
    second = await login(client, first.email)
    known = await client.post("/v1/auth/forgot-password", json={"email": first.email})
    unknown = await client.post("/v1/auth/forgot-password", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    token = mailbox.token(first.email, "reset-password")
    async with admin_engine.connect() as db:
        row = (
            await db.execute(text("SELECT token_hash, expires_at, created_at FROM password_resets"))
        ).one()
        assert row.token_hash == digest(token)
        assert timedelta(minutes=29) < row.expires_at - row.created_at < timedelta(minutes=31)
    body = {"token": token, "new_password": NEW_PASSWORD}
    assert (await client.post("/v1/auth/reset-password", json=body)).status_code == 200
    assert (await client.post("/v1/auth/reset-password", json=body)).status_code == 400
    for account in [first, second]:
        assert (await client.get("/v1/me", headers=account.headers)).status_code == 401
        assert (
            await client.post("/v1/auth/refresh", json={"refresh_token": account.refresh})
        ).status_code == 401
    assert (
        await client.post("/v1/auth/login", json={"email": first.email, "password": PASSWORD})
    ).status_code == 401
    await login(client, first.email, NEW_PASSWORD)


async def test_password_change_keeps_current_session(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    first = await signup(client, mailbox)
    second = await login(client, first.email)
    body = {"current_password": "wrong-value", "new_password": NEW_PASSWORD}
    assert (
        await client.post("/v1/me/change-password", headers=first.headers, json=body)
    ).status_code == 400
    body["current_password"] = PASSWORD
    assert (
        await client.post("/v1/me/change-password", headers=first.headers, json=body)
    ).status_code == 200
    assert (await client.get("/v1/me", headers=first.headers)).status_code == 200
    assert (await client.get("/v1/me", headers=second.headers)).status_code == 401
    await login(client, first.email, NEW_PASSWORD)


async def test_lockout_email_ip_pair_and_expiry(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    account = await signup(client, mailbox)
    unknown = await client.post(
        "/v1/auth/login", json={"email": "unknown@example.com", "password": "wrong-value"}
    )
    for _ in range(5):
        response = await client.post(
            "/v1/auth/login", json={"email": account.email, "password": "wrong-value"}
        )
        assert response.status_code == 401 and response.json() == unknown.json()
    response = await client.post(
        "/v1/auth/login", json={"email": account.email, "password": PASSWORD}
    )
    assert response.status_code == 401 and response.json() == unknown.json()
    async with admin_engine.begin() as db:
        row = (await db.execute(text("SELECT failed_login_count, locked_until FROM users"))).one()
        assert row.failed_login_count == 5
        assert now() + timedelta(minutes=14) < row.locked_until < now() + timedelta(minutes=16)
        await db.execute(
            text("UPDATE login_attempts SET locked_until = now() - interval '1 minute'")
        )
    await login(client, account.email)


async def test_resend_limit_and_expired_tokens(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    account = await signup(client, mailbox, verify=False)
    for _ in range(3):
        assert (
            await client.post("/v1/auth/resend-verification", json={"email": account.email})
        ).status_code == 200
    assert (
        await client.post("/v1/auth/resend-verification", json={"email": account.email})
    ).status_code == 429
    token = mailbox.token(account.email, "verify-email")
    async with admin_engine.begin() as db:
        await db.execute(
            text("UPDATE email_verifications SET expires_at = now() - interval '1 second'")
        )
    assert (await client.post("/v1/auth/verify-email", json={"token": token})).status_code == 400
    await client.post("/v1/auth/forgot-password", json={"email": account.email})
    token = mailbox.token(account.email, "reset-password")
    async with admin_engine.begin() as db:
        await db.execute(
            text("UPDATE password_resets SET expires_at = now() - interval '1 second'")
        )
    assert (
        await client.post(
            "/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
        )
    ).status_code == 400


@pytest.mark.parametrize("password", ["short", "password", "12345678", "Password"])
async def test_password_policy(client: httpx.AsyncClient, password: str) -> None:
    response = await client.post(
        "/v1/auth/signup",
        json={
            "name": "Owner",
            "email": "owner@example.com",
            "password": password,
            "business_name": "Shop",
        },
    )
    assert response.status_code == 422
    assert set(response.json()) == {"error"}


async def test_bad_and_expired_access_tokens(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    import jwt

    from janus_api.core.config import get_settings

    account = await signup(client, mailbox)
    key = get_settings().jwt_secret.get_secret_value()
    claims = jwt.decode(account.access, key, algorithms=["HS256"], audience="janus-api")
    assert claims["exp"] - claims["iat"] == 900
    claims["exp"] = int((now() - timedelta(seconds=1)).timestamp())
    expired = jwt.encode(claims, key, algorithm="HS256")
    for token in ["invalid-access-token", expired, account.access + "tampered"]:
        response = await client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401 and set(response.json()) == {"error"}
    other = await signup(client, mailbox, "other@example.com")
    sessions = (await client.get("/v1/auth/sessions", headers=other.headers)).json()
    assert (
        await client.delete(f"/v1/auth/sessions/{sessions[0]['id']}", headers=account.headers)
    ).status_code == 404
    response = await client.get("/v1/me", headers=account.headers)
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-request-id"]
