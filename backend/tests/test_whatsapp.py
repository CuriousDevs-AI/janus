"""One real-Postgres flow, with Meta's network boundary intercepted locally."""

import asyncio
import hashlib
import hmac
import json
import os
from time import time
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from janus_api.core.config import get_settings
from janus_api.whatsapp import meta
from janus_api.whatsapp.worker import run_once as send_once
from janus_api.worker.service import run_once as ingest_once
from tests.conftest import Mailbox
from tests.helpers import signup


async def test_whatsapp_flow(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
    admin_engine: AsyncEngine,
) -> None:
    sent: list[dict[str, Any]] = []
    uncertain = False

    async def fake_meta(method: str, path: str, token: str, **kwargs: Any) -> dict[str, Any]:
        assert token == "test-access-token-for-meta"
        if path.endswith("phone_numbers"):
            return {
                "data": [
                    {
                        "id": "123456789",
                        "display_phone_number": "+919876500000",
                        "verified_name": "Test business",
                    }
                ]
            }
        if path.endswith("message_templates"):
            return {
                "data": [
                    {
                        "name": "enquiry",
                        "language": "en_US",
                        "status": "APPROVED",
                        "components": [{"type": "BODY", "text": "Hello {{1}}."}],
                    }
                ]
            }
        assert method == "POST" and path == "123456789/messages"
        sent.append(kwargs["payload"])
        if uncertain:
            raise httpx.ReadTimeout("Simulated lost response")
        return {"messages": [{"id": f"wamid.out-{len(sent)}"}]}

    monkeypatch.setattr(get_settings(), "meta_graph_version", "v99.0")
    monkeypatch.setattr(meta, "request", fake_meta)
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])
    worker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        owner = await signup(client, mailbox)
        other = await signup(client, mailbox, "other@example.com")
        response = await client.post(
            "/v1/sources",
            headers=owner.headers,
            json={"name": "Enquiries", "connectionKind": "csv"},
        )
        source = response.json()
        response = await client.post(
            f"/v1/sources/{source['id']}/imports",
            headers={**owner.headers, "Content-Type": "text/csv", "Idempotency-Key": "initial-csv"},
            content="name,phone\nAsha,9876543210\n",
        )
        assert response.status_code == 202, response.text
        assert await ingest_once(worker)
        leads = (await client.get("/v1/leads", headers=owner.headers)).json()
        secret = "local-meta-app-secret"
        response = await client.put(
            "/v1/whatsapp/connection",
            headers=owner.headers,
            json={
                "wabaId": "987654321",
                "phoneNumberId": "123456789",
                "accessToken": "test-access-token-for-meta",
                "appSecret": secret,
            },
        )
        assert response.status_code == 200, response.text
        config = response.json()
        assert config["status"] == "available" and config["verifyToken"]
        assert "accessToken" not in config and "appSecret" not in config
        callback = httpx.URL(config["callbackUrl"]).path
        params = {"hub.mode": "subscribe", "hub.challenge": "12345", "hub.verify_token": "wrong"}
        assert (await client.get(callback, params=params)).status_code == 403
        params["hub.verify_token"] = config["verifyToken"]
        assert (await client.get(callback, params=params)).text == "12345"
        assert (await client.get("/v1/whatsapp/connection", headers=owner.headers)).json()[
            "verifyToken"
        ] is None
        assert any(
            s["source"] == "whatsapp"
            for s in (await client.get("/v1/sources", headers=owner.headers)).json()
        )
        response = await client.post(
            "/v1/whatsapp/conversations",
            headers=owner.headers,
            json={"contactId": leads[0]["customerId"]},
        )
        assert response.status_code == 200, response.text
        thread_id = response.json()["id"]
        path = f"/v1/whatsapp/conversations/{thread_id}/messages"
        assert (await client.get(path, headers=other.headers)).status_code == 404
        assert (await client.get("/v1/whatsapp/conversations", headers=other.headers)).json() == []
        assert (
            await client.post(
                path,
                headers={**owner.headers, "Idempotency-Key": "outside"},
                json={"kind": "text", "body": "Hi"},
            )
        ).status_code == 422
        # A template needs the recorded WhatsApp opt-in, not only the per-message confirmation.
        consent = await client.patch(
            f"/v1/contacts/{leads[0]['customerId']}/consent",
            headers=owner.headers,
            json={"whatsappOptIn": True, "consentSource": "test"},
        )
        assert consent.status_code == 200, consent.text
        message = {
            "kind": "template",
            "templateName": "enquiry",
            "language": "en_US",
            "parameters": ["Asha"],
            "optInConfirmed": True,
        }
        headers = {**owner.headers, "Idempotency-Key": "first"}
        queued = await client.post(path, headers=headers, json=message)
        assert queued.status_code == 202, queued.text
        assert queued.json()["status"] == "queued" and queued.json()["body"] == "Hello Asha."
        assert (await client.post(path, headers=headers, json=message)).json()[
            "id"
        ] == queued.json()["id"]
        assert (
            await client.post(path, headers=headers, json={**message, "parameters": ["Other"]})
        ).status_code == 409
        assert sorted(await asyncio.gather(send_once(worker), send_once(worker))) == [False, True]
        assert len(sent) == 1 and sent[0]["to"] == "919876543210"
        assert (await client.get(path, headers=owner.headers)).json()[0]["status"] == "accepted"

        async def webhook(value: dict[str, Any], valid: bool = True) -> httpx.Response:
            payload = {
                "object": "whatsapp_business_account",
                "entry": [
                    {
                        "id": "987654321",
                        "changes": [
                            {
                                "field": "messages",
                                "value": {"metadata": {"phone_number_id": "123456789"}, **value},
                            }
                        ],
                    }
                ],
            }
            body = json.dumps(payload).encode()
            signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            return await client.post(
                callback,
                content=body,
                headers={"X-Hub-Signature-256": "sha256=" + (signature if valid else "bad")},
            )

        incoming = {
            "messages": [
                {
                    "id": "wamid.in-1",
                    "from": "919876543210",
                    "timestamp": str(int(time())),
                    "type": "text",
                    "text": {"body": "Please send the quote"},
                }
            ]
        }
        assert (await webhook(incoming, False)).status_code == 401
        assert (await webhook(incoming)).status_code == 200
        assert (await webhook(incoming)).status_code == 200
        assert await ingest_once(worker)
        assert not await ingest_once(worker)
        assert len((await client.get("/v1/leads", headers=owner.headers)).json()) == 1
        assert (await client.get(path, headers=owner.headers)).json()[-1][
            "body"
        ] == "Please send the quote"
        assert (
            await client.post(
                path,
                headers={**owner.headers, "Idempotency-Key": "reply"},
                json={"kind": "text", "body": "I will prepare it."},
            )
        ).status_code == 202
        assert await send_once(worker)
        for status in ("read", "delivered", "sent"):
            result = await webhook(
                {
                    "statuses": [
                        {
                            "id": "wamid.out-1",
                            "status": status,
                            "timestamp": str(int(time())),
                            "recipient_id": "919876543210",
                            "biz_opaque_callback_data": sent[0]["biz_opaque_callback_data"],
                        }
                    ]
                }
            )
            assert result.status_code == 200, result.text
            assert await ingest_once(worker)
        assert (await client.get(path, headers=owner.headers)).json()[0]["status"] == "read"
        for status in ("failed", "sent"):
            response = await webhook(
                {
                    "statuses": [
                        {
                            "id": "wamid.out-2",
                            "status": status,
                            "timestamp": str(int(time())),
                            "recipient_id": "919876543210",
                            "biz_opaque_callback_data": sent[1]["biz_opaque_callback_data"],
                        }
                    ]
                }
            )
            assert response.status_code == 200
            assert await ingest_once(worker)
        rows = (await client.get(path, headers=owner.headers)).json()
        assert (
            next(row for row in rows if row["body"] == "I will prepare it.")["status"] == "failed"
        )
        uncertain = True
        assert (
            await client.post(
                path,
                headers={**owner.headers, "Idempotency-Key": "timeout"},
                json={"kind": "text", "body": "One detail"},
            )
        ).status_code == 202
        assert await send_once(worker)
        assert not await send_once(worker) and len(sent) == 3
        assert (await client.get(path, headers=owner.headers)).json()[-1]["status"] == "unknown"
        assert (
            await webhook(
                {
                    "statuses": [
                        {
                            "id": "wamid.out-3",
                            "status": "delivered",
                            "timestamp": str(int(time())),
                            "recipient_id": "919876543210",
                            "biz_opaque_callback_data": sent[2]["biz_opaque_callback_data"],
                        }
                    ]
                }
            )
        ).status_code == 200
        assert await ingest_once(worker)
        assert (await client.get(path, headers=owner.headers)).json()[-1]["status"] == "delivered"
        async with admin_engine.begin() as db:
            await db.execute(
                text(
                    "UPDATE whatsapp_conversations "
                    "SET last_inbound_at = now() - interval '25 hours'"
                )
            )
        assert (
            await client.post(
                path,
                headers={**owner.headers, "Idempotency-Key": "expired"},
                json={"kind": "text", "body": "Outside window"},
            )
        ).status_code == 422
        # A sender disabled after queueing cannot send; a stale claimed job is never replayed.
        pending = await client.post(
            path, headers={**owner.headers, "Idempotency-Key": "disabled"}, json=message
        )
        assert pending.status_code == 202
        async with admin_engine.begin() as db:
            await db.execute(
                text("UPDATE memberships SET status = 'disabled' WHERE user_id = :id"),
                {"id": owner.user_id},
            )
        assert await send_once(worker) and len(sent) == 3
        async with admin_engine.begin() as db:
            await db.execute(
                text("UPDATE memberships SET status = 'active' WHERE user_id = :id"),
                {"id": owner.user_id},
            )
        assert (await client.get(path, headers=owner.headers)).json()[-1]["status"] == "failed"
        pending = await client.post(
            path, headers={**owner.headers, "Idempotency-Key": "crashed"}, json=message
        )
        assert pending.status_code == 202
        async with admin_engine.begin() as db:
            await db.execute(
                text(
                    "UPDATE whatsapp_messages SET status = 'sending', "
                    "started_at = now() - interval '3 minutes' WHERE id = :id"
                ),
                {"id": int(pending.json()["id"])},
            )
        assert await send_once(worker) and len(sent) == 3
        assert (await client.get(path, headers=owner.headers)).json()[-1]["status"] == "unknown"
        incoming["messages"][0].update({"id": "wamid.new-customer", "from": "919876543211"})
        assert (await webhook(incoming)).status_code == 200
        assert await ingest_once(worker)
        leads = (await client.get("/v1/leads", headers=owner.headers)).json()
        assert len(leads) == 2 and leads[-1]["source"] == "whatsapp"
        async with engine.begin() as db:
            assert (await db.execute(text("SELECT count(*) FROM whatsapp_messages"))).scalar() == 0
    finally:
        await engine.dispose()
