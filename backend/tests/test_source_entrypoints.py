import asyncio
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from janus_api.core.config import get_settings
from janus_api.core.db import session_factory
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.sources import website
from janus_api.worker.service import run_once
from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup
from tests.test_ingestion import events, source
from tests.test_ingestion import worker_factory as worker_factory


@pytest.mark.parametrize(
    "preset,payload",
    [
        (
            "exotel",
            {
                "CallSid": "call-1",
                "CallFrom": "9876543210",
                "RecordingUrl": "https://example.com/call.mp3",
            },
        ),
        (
            "knowlarity",
            {
                "uuid": "call-1",
                "Call_Type": "Incoming",
                "caller_id": "9876543210",
                "resource_url": "https://example.com/call.mp3",
            },
        ),
        (
            "myoperator",
            {
                "event_id": "call-1",
                "channel": "call",
                "event_type": "call.end",
                "direction": "incoming",
                "customer_identifier": "+919876543210",
                "payload": {"recording_filename": "call-1.mp3"},
            },
        ),
        (
            "tata_tele",
            {
                "event_id": "call-1",
                "phone": "9876543210",
                "direction": "inbound",
                "recording_url": "https://example.com/call.mp3",
            },
        ),
        ("zapier", {"event_id": "lead-1", "phone": "9876543210"}),
        ("make", {"event_id": "lead-1", "phone": "9876543210"}),
    ],
)
async def test_provider_ingest_preserves_source_and_recording(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    admin_engine: AsyncEngine,
    preset: str,
    payload: dict[str, Any],
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner, preset=preset)
    if preset == "exotel":
        response = await client.get(
            connection["callbackUrl"], params={**payload, "token": connection["signingSecret"]}
        )
    else:
        response = await client.post(
            connection["webhookUrl"],
            json=payload,
            headers={"X-Janus-Token": connection["signingSecret"]},
        )
    assert response.status_code == 200, response.text
    assert await run_once(worker_factory)
    event = (await events(client, owner, connection))[0]
    assert event["status"] == "processed", event
    lead = (await client.get(f"/v1/leads/{event['leadId']}", headers=owner.headers)).json()
    assert lead["source"] == ("webhook" if preset in {"zapier", "make"} else "phone_call")
    if preset == "myoperator":
        assert lead["recordingReference"] == "call-1.mp3" and lead["recordingUrl"] is None
    elif preset not in {"zapier", "make"}:
        assert lead["recordingUrl"] == "https://example.com/call.mp3"
    # Delivery metadata can change on provider retries without making another lead.
    retry = await client.post(
        connection["webhookUrl"],
        json={**payload, "delivery_attempt": 2},
        headers={"X-Janus-Token": connection["signingSecret"]},
    )
    assert retry.status_code == 200 and retry.json()["duplicate"]
    assert not await run_once(worker_factory)
    async with admin_engine.connect() as db:
        raw = await db.scalar(text("SELECT payload::text FROM raw_events"))
        assert connection["signingSecret"] not in raw
    bad = await client.post(
        connection["webhookUrl"], json=payload, headers={"X-Janus-Token": "wrong"}
    )
    assert bad.status_code == 401


async def test_google_lead_test_auth_and_column_mapping(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    admin_engine: AsyncEngine,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner, preset="google_ads_lead_form")
    payload = {
        "lead_id": "opaque/Google+lead=id",
        "google_key": connection["signingSecret"],
        "campaign_id": 987654321012345678,
        "user_column_data": [
            {"column_id": "FIRST_NAME", "string_value": "Asha"},
            {"column_id": "LAST_NAME", "string_value": "Shah"},
            {"column_id": "PHONE_NUMBER", "string_value": "+919876543210"},
        ],
    }
    wrong = await client.post(connection["webhookUrl"], json={**payload, "google_key": "wrong"})
    assert wrong.status_code == 401
    test = await client.post(connection["webhookUrl"], json={**payload, "is_test": True})
    assert test.status_code == 200 and test.json() == {}
    assert not await run_once(worker_factory)
    assert await events(client, owner, connection) == []
    real = await client.post(connection["webhookUrl"], json=payload)
    assert real.status_code == 200 and real.json() == {}
    assert await run_once(worker_factory)
    event = (await events(client, owner, connection))[0]
    contact = (
        await client.get(f"/v1/contacts/{event['customerId']}", headers=owner.headers)
    ).json()
    assert contact["name"] == "Asha Shah"
    lead = (await client.get(f"/v1/leads/{event['leadId']}", headers=owner.headers)).json()
    assert lead["campaign"] == "987654321012345678"
    async with admin_engine.connect() as db:
        stored = await db.scalar(text("SELECT payload::text FROM raw_events"))
        assert "google_key" not in stored and connection["signingSecret"] not in stored
    assert (await client.post(connection["webhookUrl"], json=payload)).status_code == 200
    assert not await run_once(worker_factory)


async def test_non_lead_notifications_and_preset_snapshot(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner, preset="myoperator")
    payload = {
        "event_id": "call-1",
        "channel": "call",
        "event_type": "call.end",
        "direction": "outgoing",
        "customer_identifier": "+919876543210",
    }
    headers = {"X-Janus-Token": connection["signingSecret"]}
    assert (
        await client.post(connection["webhookUrl"], json=payload, headers=headers)
    ).status_code == 200
    assert not await run_once(worker_factory)
    payload["direction"] = "incoming"
    assert (
        await client.post(connection["webhookUrl"], json=payload, headers=headers)
    ).status_code == 200
    updated = await client.put(
        f"/v1/sources/{connection['id']}",
        headers=owner.headers,
        json={"name": "Custom now", "status": "connected", "preset": "custom"},
    )
    assert updated.status_code == 200
    assert await run_once(worker_factory)
    lead = (await client.get("/v1/leads", headers=owner.headers)).json()[0]
    assert lead["source"] == "phone_call"


async def test_website_origin_preflight_embed_and_worker(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(
        client, owner, connectionKind="embed", allowedOrigins=["https://shop.example.com"]
    )
    assert connection["signingSecret"] is None and connection["source"] == "website"
    snippet = (
        await client.get(f"/v1/sources/{connection['id']}/embed", headers=owner.headers)
    ).json()["html"]
    assert (
        connection["ingestUrl"] in snippet
        and "_janus_hp" in snippet
        and "Idempotency-Key" in snippet
    )
    for origin in [None, "null", "https://evil.example", "https://shop.example.com.evil.test"]:
        headers = {"Idempotency-Key": "form-1"}
        if origin:
            headers["Origin"] = origin
        response = await client.post(
            connection["ingestUrl"], json={"phone": "9876543210"}, headers=headers
        )
        assert response.status_code == 403
        assert "access-control-allow-origin" not in response.headers
    headers = {"Origin": "https://shop.example.com", "Idempotency-Key": "form-1"}
    preflight = await client.options(
        connection["ingestUrl"],
        headers={
            "Origin": headers["Origin"],
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,idempotency-key",
        },
    )
    assert (
        preflight.status_code == 204
        and preflight.headers["access-control-allow-origin"] == headers["Origin"]
    )
    result = await client.post(
        connection["ingestUrl"],
        headers=headers,
        json={"name": "Asha", "phone": "9876543210", "_janus_hp": ""},
    )
    assert result.status_code == 202, result.text
    assert result.headers["access-control-allow-origin"] == headers["Origin"]
    assert await run_once(worker_factory)
    assert (await client.get("/v1/leads", headers=owner.headers)).json()[0]["source"] == "website"


async def test_form_rate_limit_honeypot_and_expiry(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(
        client, owner, connectionKind="embed", allowedOrigins=["https://shop.example.com"]
    )
    monkeypatch.setattr(get_settings(), "form_limit_per_minute", 2)
    fixed = now().replace(second=0, microsecond=0)
    monkeypatch.setattr(website, "now", lambda: fixed)
    headers = {
        "Origin": "https://shop.example.com",
        "Idempotency-Key": "spam-1",
        "X-Forwarded-For": "fake",
    }
    for _ in range(2):
        response = await client.post(
            connection["ingestUrl"],
            headers=headers,
            json={"_janus_hp": "filled", "phone": "9876543210"},
        )
        assert response.status_code == 422
    blocked = await client.post(
        connection["ingestUrl"],
        headers={**headers, "X-Forwarded-For": "different"},
        json={"phone": "9876543210"},
    )
    assert blocked.status_code == 429
    assert blocked.headers["access-control-allow-origin"] == headers["Origin"]
    async with admin_engine.connect() as db:
        assert await db.scalar(text("SELECT count(*) FROM jobs")) == 0
        assert await db.scalar(text("SELECT count FROM form_rate_limits")) == 3
        assert await db.scalar(text("SELECT ip_hash FROM form_rate_limits")) != "127.0.0.1"
    monkeypatch.setattr(website, "now", lambda: fixed + timedelta(minutes=1))
    response = await client.post(
        connection["ingestUrl"], headers=headers, json={"phone": "9876543210"}
    )
    assert response.status_code == 202


async def test_concurrent_website_quota(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(
        client, owner, connectionKind="embed", allowedOrigins=["https://shop.example.com"]
    )
    monkeypatch.setattr(get_settings(), "form_limit_per_minute", 2)
    fixed = now()
    monkeypatch.setattr(website, "now", lambda: fixed)
    results = await asyncio.gather(
        *(
            client.post(
                connection["ingestUrl"],
                headers={"Origin": "https://shop.example.com", "Idempotency-Key": f"form-{i}"},
                json={"phone": "9876543210"},
            )
            for i in range(5)
        )
    )
    assert sorted(result.status_code for result in results) == [202, 202, 429, 429, 429]


async def test_api_key_ingest_scope_expiry_and_revocation(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    admin_engine: AsyncEngine,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner, connectionKind="api_key")
    second = await source(client, owner, connectionKind="api_key")
    response = await client.post(
        f"/v1/sources/{connection['id']}/keys", headers=owner.headers, json={"name": "ERP ingest"}
    )
    assert response.status_code == 201, response.text
    key = response.json()
    headers = {"Authorization": f"Bearer {key['key']}", "Idempotency-Key": "erp-1"}
    assert (
        await client.post(second["ingestUrl"], headers=headers, json={"phone": "9876543210"})
    ).status_code == 403
    accepted = await client.post(
        connection["ingestUrl"], headers=headers, json={"phone": "9876543210"}
    )
    assert accepted.status_code == 202, accepted.text
    duplicate = await client.post(
        connection["ingestUrl"], headers=headers, json={"phone": "9876543210"}
    )
    assert duplicate.status_code == 202 and duplicate.json()["duplicate"]
    assert await run_once(worker_factory)
    assert (await client.get("/v1/leads", headers=owner.headers)).json()[0]["source"] == "api"
    assert (await client.get("/v1/me", headers=headers)).status_code == 401
    listed = (
        await client.get(f"/v1/sources/{connection['id']}/keys", headers=owner.headers)
    ).json()[0]
    assert "key" not in listed and "key_hash" not in listed and listed["lastUsedAt"]
    async with admin_engine.begin() as db:
        stored = await db.scalar(text("SELECT key_hash FROM api_keys"))
        assert key["key"] != stored and key["prefix"] not in stored
        await db.execute(text("UPDATE api_keys SET expires_at=now()-interval '1 second'"))
    assert (await client.post(connection["ingestUrl"], headers=headers, json={})).status_code == 401
    async with admin_engine.begin() as db:
        await db.execute(text("UPDATE api_keys SET expires_at=NULL"))
    assert (
        await client.delete(
            f"/v1/sources/{connection['id']}/keys/{key['id']}", headers=owner.headers
        )
    ).status_code == 204
    assert (await client.post(connection["ingestUrl"], headers=headers, json={})).status_code == 401


async def test_new_source_management_permissions_and_rls(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
) -> None:
    first = await signup(client, mailbox, "first@example.com")
    second = await signup(client, mailbox, "second@example.com")
    connection = await source(client, second, connectionKind="api_key")
    key = (
        await client.post(
            f"/v1/sources/{connection['id']}/keys", headers=second.headers, json={"name": "Test"}
        )
    ).json()
    agent = await accept_new(client, await invite(client, mailbox, second, "agent@example.com"))
    for headers, expected in [(first.headers, 404), (agent, 403)]:
        assert (
            await client.get(f"/v1/sources/{connection['id']}/keys", headers=headers)
        ).status_code == expected
        assert (
            await client.delete(f"/v1/sources/{connection['id']}/keys/{key['id']}", headers=headers)
        ).status_code == expected
    async with session_factory()() as db:
        await set_context(db, tenant_id=first.tenant_id, user_id=first.user_id)
        assert await db.scalar(text("SELECT count(*) FROM api_keys")) == 0
        with pytest.raises(DBAPIError):
            await db.execute(
                text(
                    "INSERT INTO form_rate_limits "
                    "(tenant_id,connection_id,ip_hash,window_start,count) "
                    "VALUES (:tenant,:connection,'hash',now(),1)"
                ),
                {"tenant": second.tenant_id, "connection": int(connection["id"])},
            )
    async with admin_engine.connect() as db:
        assert (
            await db.scalar(
                text(
                    "SELECT count(*) FROM pg_class "
                    "WHERE relname IN ('api_keys','form_rate_limits') "
                    "AND relrowsecurity AND relforcerowsecurity"
                )
            )
            == 2
        )
    bad = await client.post(
        f"/v1/sources/{connection['id']}/keys",
        headers=second.headers,
        json={"name": "Too broad", "scopes": ["members:manage"]},
    )
    assert bad.status_code == 422
    presets = await client.get("/v1/sources/presets", headers=second.headers)
    assert presets.status_code == 200 and len(presets.json()) == 8


@pytest.mark.parametrize(
    "origin",
    [
        "https://*.example.com",
        "https://user:pass@example.com",
        "https://shop.example.com/path",
        "null",
    ],
)
async def test_invalid_website_origin_config(
    client: httpx.AsyncClient, mailbox: Mailbox, origin: str
) -> None:
    owner = await signup(client, mailbox)
    response = await client.post(
        "/v1/sources",
        headers=owner.headers,
        json={"name": "Website", "connectionKind": "embed", "allowedOrigins": [origin]},
    )
    assert response.status_code == 422


async def test_provider_form_encoding_and_secret_rotation(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner, preset="knowlarity")
    payload = {"uuid": "call-encoded", "Call_Type": "Incoming", "caller_id": "+919876543210"}
    result = await client.post(connection["callbackUrl"], data=payload)
    assert result.status_code == 200, result.text
    assert await run_once(worker_factory)
    rotated = await client.post(
        f"/v1/sources/{connection['id']}/rotate-secret", headers=owner.headers
    )
    assert rotated.status_code == 200
    assert (await client.post(connection["callbackUrl"], data=payload)).status_code == 401
    assert (await client.post(rotated.json()["callbackUrl"], data=payload)).status_code == 200
    assert not await run_once(worker_factory)


async def test_form_duplicate_conflicts_consume_quota(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(
        client, owner, connectionKind="embed", allowedOrigins=["https://shop.example.com"]
    )
    monkeypatch.setattr(get_settings(), "form_limit_per_minute", 2)
    fixed = now()
    monkeypatch.setattr(website, "now", lambda: fixed)
    headers = {"Origin": "https://shop.example.com", "Idempotency-Key": "same-key"}
    assert (
        await client.post(connection["ingestUrl"], headers=headers, json={"phone": "9876543210"})
    ).status_code == 202
    assert (
        await client.post(connection["ingestUrl"], headers=headers, json={"phone": "9876543211"})
    ).status_code == 409
    assert (
        await client.post(connection["ingestUrl"], headers=headers, json={"phone": "9876543212"})
    ).status_code == 429
