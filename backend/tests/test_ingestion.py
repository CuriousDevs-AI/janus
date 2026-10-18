import asyncio
import hashlib
import hmac
import json
import os
from collections.abc import AsyncIterator
from datetime import timedelta
from time import time
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from janus_api.core.db import session_factory
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.sources import ingest, service
from janus_api.worker.service import run_once
from tests.conftest import Mailbox
from tests.helpers import Account, accept_new, invite, signup


@pytest.fixture(scope="session")
async def worker_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def source(client: httpx.AsyncClient, account: Account, **extra: Any) -> dict[str, Any]:
    response = await client.post(
        "/v1/sources", headers=account.headers, json={"name": "Sales enquiries", **extra}
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


def signature(secret: str, body: bytes, key: str, timestamp: str | None = None) -> dict[str, str]:
    timestamp = timestamp or str(int(time()))
    signed = timestamp.encode() + b"." + key.encode() + b"." + body
    return {
        "X-Janus-Timestamp": timestamp,
        "Idempotency-Key": key,
        "X-Janus-Signature": "sha256="
        + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest(),
        "Content-Type": "application/json",
    }


async def deliver(
    client: httpx.AsyncClient,
    connection: dict[str, Any],
    payload: dict[str, Any],
    key: str = "event-1",
) -> httpx.Response:
    body = json.dumps(payload).encode()
    return await client.post(
        connection["webhookUrl"],
        content=body,
        headers=signature(connection["signingSecret"], body, key),
    )


async def events(
    client: httpx.AsyncClient, owner: Account, connection: dict[str, Any]
) -> list[dict[str, Any]]:
    response = await client.get(f"/v1/sources/{connection['id']}/events", headers=owner.headers)
    assert response.status_code == 200, response.text
    return list(response.json())


async def test_webhook_worker_contact_and_replay(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    admin_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner)
    payload = {
        "name": "Asha",
        "phone": "98765 43210",
        "requirement": "Office chairs",
        "recording_url": "https://example.com/call.mp3",
    }
    first = await deliver(client, connection, payload)
    assert first.status_code == 202 and not first.json()["duplicate"], first.text
    assert (await events(client, owner, connection))[0]["status"] == "pending"
    assert (await client.get("/v1/leads", headers=owner.headers)).json() == []
    assert await run_once(worker_factory)
    assert not await run_once(worker_factory)
    event = (await events(client, owner, connection))[0]
    assert event["status"] == "processed" and event["result"] == "new_profile"
    lead = (await client.get(f"/v1/leads/{event['leadId']}", headers=owner.headers)).json()
    assert lead["stage"] == "new" and lead["recordingUrl"] == payload["recording_url"]
    contact = (
        await client.get(f"/v1/contacts/{event['customerId']}", headers=owner.headers)
    ).json()
    assert contact["phone"] == "+919876543210" and contact["name"] == "Asha"
    # Retry received on the next UTC day must still hit the global receipt key.
    monkeypatch.setattr(ingest, "now", lambda: now() + timedelta(days=1))
    repeated = await deliver(client, connection, payload)
    assert repeated.status_code == 202 and repeated.json() == {
        "id": first.json()["id"],
        "duplicate": True,
    }
    conflict = await deliver(client, connection, {"phone": "+919876543210", "name": "Changed"})
    assert conflict.status_code == 409
    assert not await run_once(worker_factory)
    async with admin_engine.connect() as db:
        assert await db.scalar(text("SELECT count(*) FROM jobs")) == 1
        assert await db.scalar(text("SELECT count(*) FROM raw_events")) == 1
        assert (
            await db.scalar(text("SELECT count(*) FROM audit_log WHERE action='lead.captured'"))
            == 1
        )
        stored = await db.scalar(text("SELECT secret_encrypted FROM source_connections"))
        assert stored != connection["signingSecret"] and connection["signingSecret"] not in stored
        partition = await db.scalar(text("SELECT tableoid::regclass::text FROM raw_events"))
        assert partition.startswith("raw_events_")
    listed = (await client.get("/v1/sources", headers=owner.headers)).json()
    assert "signingSecret" not in listed[0] and "secret_encrypted" not in listed[0]


async def test_mapping_snapshot_and_contact_enrichment(
    client: httpx.AsyncClient, mailbox: Mailbox, worker_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner = await signup(client, mailbox)
    mapping = [
        {"rawField": "caller.number", "mapsTo": "phone"},
        {"rawField": "caller.email", "mapsTo": "email"},
    ]
    connection = await source(client, owner, fieldMapping=mapping)
    assert (
        await deliver(client, connection, {"caller": {"number": "9876543210"}})
    ).status_code == 202
    update = await client.put(
        f"/v1/sources/{connection['id']}",
        headers=owner.headers,
        json={"name": "Updated", "status": "connected"},
    )
    assert update.status_code == 200, update.text
    assert await run_once(worker_factory)  # Uses the old mapping captured with the event.
    assert (
        await deliver(
            client,
            connection,
            {
                "phone": "+91 98765 43210",
                "name": "Asha",
                "email": "ASHA@example.com",
                "company": "Asha Traders",
            },
            "event-2",
        )
    ).status_code == 202
    assert await run_once(worker_factory)
    # Email-only follow-up matches the same contact.
    assert (
        await deliver(client, connection, {"email": "asha@example.com"}, "event-3")
    ).status_code == 202
    assert await run_once(worker_factory)
    rows = await events(client, owner, connection)
    assert [r["result"] for r in rows] == ["new_profile", "merged", "merged"]
    assert len({r["customerId"] for r in rows}) == 1
    contact = (
        await client.get(f"/v1/contacts/{rows[0]['customerId']}", headers=owner.headers)
    ).json()
    assert contact["name"] == "Asha" and contact["email"] == "asha@example.com"
    assert contact["company"] == "Asha Traders"


@pytest.mark.parametrize(
    "mode", ["bad_signature", "expired", "changed_key", "invalid_json", "large"]
)
async def test_rejected_ingestion_is_not_enqueued(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine, mode: str
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner)
    body = b'{"phone":"9876543210"}'
    if mode == "invalid_json":
        body = b'{"phone":NaN}'
    if mode == "large":
        body = b"x" * (ingest.MAX_PAYLOAD + 1)
    headers = signature(
        connection["signingSecret"],
        body,
        "event-1",
        str(int(time()) - 600) if mode == "expired" else None,
    )
    if mode == "bad_signature":
        headers["X-Janus-Signature"] = "sha256=" + "0" * 64
    if mode == "changed_key":
        headers["Idempotency-Key"] = "forged-key"
    response = await client.post(connection["webhookUrl"], content=body, headers=headers)
    assert response.status_code == ({"invalid_json": 422, "large": 413}.get(mode, 401)), (
        response.text
    )
    async with admin_engine.connect() as db:
        for table in ["ingest_receipts", "raw_events", "jobs"]:
            assert await db.scalar(text(f"SELECT count(*) FROM {table}")) == 0


async def test_secret_rotation_pause_and_verification(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
) -> None:
    owner = await signup(client, mailbox, verify=False)
    assert (
        await client.post("/v1/sources", headers=owner.headers, json={"name": "Test"})
    ).status_code == 403
    await client.post(
        "/v1/auth/verify-email", json={"token": mailbox.token(owner.email, "verify-email")}
    )
    connection = await source(client, owner)
    rotated = await client.post(
        f"/v1/sources/{connection['id']}/rotate-secret", headers=owner.headers
    )
    assert rotated.status_code == 200, rotated.text
    assert (await deliver(client, connection, {"phone": "9876543210"})).status_code == 401
    connection = rotated.json()
    assert (await deliver(client, connection, {"phone": "9876543210"})).status_code == 202
    response = await client.put(
        f"/v1/sources/{connection['id']}",
        headers=owner.headers,
        json={"name": "Paused", "status": "available"},
    )
    assert response.status_code == 200
    assert (
        await deliver(client, connection, {"phone": "9876543210"}, "new-key")
    ).status_code == 404


async def test_concurrent_deliveries_and_workers(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    admin_engine: AsyncEngine,
) -> None:
    owner = await signup(client, mailbox)
    connections = [await source(client, owner), await source(client, owner)]
    payload = {"phone": "9876543210"}
    results = await asyncio.gather(*(deliver(client, connections[0], payload) for _ in range(4)))
    assert all(r.status_code == 202 for r in results)
    assert sum(not r.json()["duplicate"] for r in results) == 1
    assert (await deliver(client, connections[1], payload)).status_code == 202
    assert all(await asyncio.gather(run_once(worker_factory), run_once(worker_factory)))
    async with admin_engine.connect() as db:
        assert await db.scalar(text("SELECT count(*) FROM contacts")) == 1
        assert await db.scalar(text("SELECT count(*) FROM leads")) == 2
        assert (
            await db.scalar(text("SELECT count(*) FROM jobs WHERE status='done' AND attempts=1"))
            == 2
        )


@pytest.mark.parametrize(
    "payload,code",
    [
        ({"name": "No identity"}, "missing_contact_identity"),
        ({"phone": "123"}, "invalid_phone"),
        ({"phone": ["9876543210"]}, "invalid_field_type"),
        ({"email": "not-an-email"}, "invalid_contact_fields"),
    ],
)
async def test_invalid_contacts_are_stored_as_failures(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    payload: dict[str, Any],
    code: str,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner)
    assert (await deliver(client, connection, payload)).status_code == 202
    assert await run_once(worker_factory)
    event = (await events(client, owner, connection))[0]
    assert event["status"] == "failed" and event["reason"] == code
    assert (await client.get("/v1/leads", headers=owner.headers)).json() == []
    assert not await run_once(worker_factory)


async def test_partial_processing_rolls_back_and_retries(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    admin_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner)
    await deliver(client, connection, {"phone": "9876543210"})
    original = service.process_event

    async def fail_after_write(db: AsyncSession, receipt_id: int) -> None:
        await original(db, receipt_id)
        await db.flush()
        raise RuntimeError("Failure must never leak payload or secrets into the event error")

    monkeypatch.setattr(service, "process_event", fail_after_write)
    assert await run_once(worker_factory)
    assert not await run_once(worker_factory)  # Backoff is enforced.
    async with admin_engine.begin() as db:
        assert await db.scalar(text("SELECT count(*) FROM contacts")) == 0
        assert await db.scalar(text("SELECT count(*) FROM leads")) == 0
        assert (
            await db.scalar(text("SELECT count(*) FROM audit_log WHERE action='lead.captured'"))
            == 0
        )
        assert await db.scalar(text("SELECT attempts FROM jobs")) == 1
        await db.execute(text("UPDATE jobs SET available_at=now()"))
    event = (await events(client, owner, connection))[0]
    assert event["status"] == "pending" and event["reason"] == "processing_failed"
    monkeypatch.setattr(service, "process_event", original)
    assert await run_once(worker_factory)
    assert (await events(client, owner, connection))[0]["status"] == "processed"


async def test_ingest_enqueue_is_atomic(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner)

    async def fail(db: AsyncSession, tenant_id: int, receipt_id: int) -> None:
        await db.flush()
        raise RuntimeError("queue insertion failed")

    monkeypatch.setattr(ingest, "enqueue", fail)
    with pytest.raises(RuntimeError):
        await deliver(client, connection, {"phone": "9876543210"})
    async with admin_engine.connect() as db:
        for table in ["ingest_receipts", "raw_events", "jobs"]:
            assert await db.scalar(text(f"SELECT count(*) FROM {table}")) == 0


async def test_sources_crm_and_worker_tenant_isolation(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    admin_engine: AsyncEngine,
) -> None:
    first = await signup(client, mailbox, "first@example.com")
    second = await signup(client, mailbox, "second@example.com")
    connection = await source(client, second)
    await deliver(client, connection, {"phone": "9876543210"})
    assert await run_once(worker_factory)
    event = (await events(client, second, connection))[0]
    for path in [
        f"/v1/sources/{connection['id']}",
        f"/v1/sources/{connection['id']}/events",
        f"/v1/leads/{event['leadId']}",
        f"/v1/contacts/{event['customerId']}",
    ]:
        assert (await client.get(path, headers=first.headers)).status_code == 404
    for factory in [session_factory(), worker_factory]:
        async with factory() as db:
            await set_context(db, tenant_id=first.tenant_id, user_id=first.user_id)
            for table in ["ingest_receipts", "raw_events", "jobs", "contacts", "leads"]:
                assert await db.scalar(text(f"SELECT count(*) FROM {table}")) == 0
            with pytest.raises(DBAPIError):
                await db.execute(
                    text("UPDATE contacts SET tenant_id=:tenant"), {"tenant": second.tenant_id}
                )
                # No visible rows above; this insert must fail RLS even with a valid other tenant.
                await db.execute(
                    text("INSERT INTO contacts (tenant_id,name,company) VALUES (:tenant,'bad','')"),
                    {"tenant": second.tenant_id},
                )
    async with session_factory()() as db:
        with pytest.raises(DBAPIError):
            await db.execute(text("SELECT * FROM public.claim_ingest_job()"))
    async with worker_factory() as db:
        with pytest.raises(DBAPIError):
            await db.execute(text("SELECT password_hash FROM users"))
    async with admin_engine.connect() as db:
        partitions = (
            await db.execute(
                text(
                    "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class "
                    "WHERE relname ~ '^raw_events_[0-9]{8}$'"
                )
            )
        ).all()
        assert len(partitions) >= 2 and all(
            row.relrowsecurity and row.relforcerowsecurity for row in partitions
        )
        partition = partitions[0].relname
    async with session_factory()() as db:
        with pytest.raises(DBAPIError):
            await db.execute(text(f"SELECT * FROM {partition}"))


@pytest.mark.parametrize("role,expected", [("admin", 201), ("manager", 403), ("agent", 403)])
async def test_source_roles_and_lead_ownership(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    role: str,
    expected: int,
) -> None:
    owner = await signup(client, mailbox)
    token = await invite(client, mailbox, owner, f"{role}@example.com", role)
    headers = await accept_new(client, token)
    response = await client.post("/v1/sources", headers=headers, json={"name": "Member source"})
    assert response.status_code == expected, response.text
    connection = await source(client, owner)
    await deliver(client, connection, {"phone": "9876543210"})
    await run_once(worker_factory)
    event = (await events(client, owner, connection))[0]
    visible = role == "admin"
    assert bool((await client.get("/v1/leads", headers=headers)).json()) == visible
    assert (
        await client.get(f"/v1/contacts/{event['customerId']}", headers=headers)
    ).status_code == (200 if visible else 404)


async def test_retry_exhaustion_and_locked_job_recovery(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    admin_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner)
    await deliver(client, connection, {"phone": "9876543210"})
    async with worker_factory() as abandoned:
        claim = (await abandoned.execute(text("SELECT * FROM claim_ingest_job()"))).first()
        assert claim is not None
        assert not await asyncio.wait_for(run_once(worker_factory), timeout=2)
        await (
            abandoned.rollback()
        )  # A disconnected/crashed worker releases the same transaction lock.

    async def broken(db: AsyncSession, receipt_id: int) -> None:
        raise RuntimeError("temporary failure")

    monkeypatch.setattr(service, "process_event", broken)
    for attempt in range(1, 6):
        assert await run_once(worker_factory)
        async with admin_engine.begin() as db:
            job = (await db.execute(text("SELECT attempts,status,available_at FROM jobs"))).one()
            assert job.attempts == attempt
            assert job.status == ("failed" if attempt == 5 else "pending")
            assert job.available_at > now()
            await db.execute(text("UPDATE jobs SET available_at=now()"))
    assert not await run_once(worker_factory)
    event = (await events(client, owner, connection))[0]
    assert event["status"] == "failed" and event["reason"] == "processing_failed"


async def test_conflicting_contact_identifiers_are_not_merged(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
    admin_engine: AsyncEngine,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner)
    await deliver(client, connection, {"phone": "9876543210", "email": "one@example.com"})
    await run_once(worker_factory)
    await deliver(client, connection, {"phone": "9876543211", "email": "two@example.com"}, "two")
    await run_once(worker_factory)
    await deliver(
        client, connection, {"phone": "9876543210", "email": "two@example.com"}, "conflict"
    )
    await run_once(worker_factory)
    event = (await events(client, owner, connection))[-1]
    assert event["status"] == "failed" and event["reason"] == "contact_identity_conflict"
    async with admin_engine.connect() as db:
        assert await db.scalar(text("SELECT count(*) FROM contacts")) == 2
        assert await db.scalar(text("SELECT count(*) FROM leads")) == 2


async def test_team_visibility_and_disabled_owner(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await signup(client, mailbox)
    admin_headers = await accept_new(
        client, await invite(client, mailbox, owner, "admin@example.com", "admin")
    )
    manager_headers = await accept_new(
        client, await invite(client, mailbox, owner, "manager@example.com", "manager")
    )
    admin_source_response = await client.post(
        "/v1/sources", headers=admin_headers, json={"name": "Admin enquiries"}
    )
    assert admin_source_response.status_code == 201
    connection = admin_source_response.json()
    await deliver(client, connection, {"phone": "9876543210"})
    await run_once(worker_factory)
    assert (await client.get("/v1/leads", headers=manager_headers)).json() == []
    team_response = await client.post("/v1/teams", headers=owner.headers, json={"name": "Sales"})
    assert team_response.status_code == 201
    team_id = team_response.json()["id"]
    members = (await client.get("/v1/members", headers=owner.headers)).json()
    admin_id = next(m["id"] for m in members if m["role"] == "admin")
    manager_id = next(m["id"] for m in members if m["role"] == "manager")
    for member_id in [admin_id, manager_id]:
        response = await client.put(
            f"/v1/teams/{team_id}/members/{member_id}", headers=owner.headers
        )
        assert response.status_code == 204, response.text
    leads = (await client.get("/v1/leads", headers=manager_headers)).json()
    assert len(leads) == 1
    assert (
        await client.get(f"/v1/contacts/{leads[0]['customerId']}", headers=manager_headers)
    ).status_code == 200
    # Already accepted events still process after their default owner is disabled, as unassigned.
    await deliver(client, connection, {"phone": "9876543211"}, "second")
    disabled = await client.patch(
        f"/v1/members/{admin_id}", headers=owner.headers, json={"status": "disabled"}
    )
    assert disabled.status_code == 200
    assert await run_once(worker_factory)
    owner_leads = (await client.get("/v1/leads", headers=owner.headers)).json()
    assert owner_leads[-1]["ownerId"] is None
    assert (await client.get("/v1/leads", headers=manager_headers)).json() == []


@pytest.mark.parametrize(
    "body", [b'{"value":1e999}', b'{"value":"\\u0000"}', b'{"value":"\\ud800"}', b"[]"]
)
async def test_jsonb_incompatible_payloads_rejected(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    body: bytes,
) -> None:
    owner = await signup(client, mailbox)
    connection = await source(client, owner)
    response = await client.post(
        connection["webhookUrl"],
        content=body,
        headers=signature(connection["signingSecret"], body, "event-1"),
    )
    assert response.status_code == 422, response.text


@pytest.mark.parametrize(
    "phone,expected",
    [
        ("022 2345 6789", "+912223456789"),
        ("+44 20 8366 1177", "+442083661177"),
        ("09876543210", "+919876543210"),
    ],
)
async def test_phone_normalization(phone: str, expected: str) -> None:
    from janus_api.crm.service import normalize_phone

    assert normalize_phone(phone) == expected
