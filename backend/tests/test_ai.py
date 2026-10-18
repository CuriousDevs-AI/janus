import json
from typing import Any

import httpx
import pytest
from litellm.llms.custom_httpx.http_handler import AsyncHTTPHandler
from openai import AsyncOpenAI
from pydantic import HttpUrl
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from janus_api.ai import gateway
from janus_api.core.config import get_settings
from janus_api.core.db import session_factory
from janus_api.core.tenancy import set_context
from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


def provider_transport(monkeypatch: pytest.MonkeyPatch, handler: Any) -> None:
    # Exercise LiteLLM's actual adapters; only external HTTP delivery is substituted.
    openai_client, http_handler = AsyncOpenAI, AsyncHTTPHandler
    transport = httpx.MockTransport(handler)

    def openai(**kwargs: Any) -> Any:
        kwargs["http_client"]._transport = transport
        return openai_client(**kwargs)

    def http(**kwargs: Any) -> Any:
        return http_handler(**kwargs, transport=transport)

    monkeypatch.setattr(gateway, "AsyncOpenAI", openai)
    monkeypatch.setattr(gateway, "AsyncHTTPHandler", http)


async def test_ai_providers_credentials_usage_and_isolation(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if "bad-key" in request.headers.get("authorization", ""):
            return httpx.Response(401, json={"error": {"message": "bad-key must never leak"}})
        if request.url.host == "api.openai.com":
            assert request.url.path == "/v1/chat/completions"
            return httpx.Response(
                200,
                json={
                    "id": "call-1",
                    "model": "gpt-4o-mini",
                    "object": "chat.completion",
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": "OK"},
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {"prompt_tokens": 5, "completion_tokens": 1, "total_tokens": 6},
                },
            )
        if request.url.host == "api.anthropic.com":
            assert (
                request.url.path == "/v1/messages"
                and request.headers["x-api-key"] == "provider-key-1234"
            )
            return httpx.Response(
                200,
                json={
                    "id": "call-2",
                    "model": "claude-sonnet-4-20250514",
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "text", "text": "OK"}],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 5, "output_tokens": 1},
                },
            )
        assert request.url.host == "generativelanguage.googleapis.com"
        assert request.url.path == "/v1beta/models/gemini-2.5-flash:generateContent"
        assert request.headers["x-goog-api-key"] == "provider-key-1234"
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {"parts": [{"text": "OK"}], "role": "model"},
                        "finishReason": "STOP",
                        "index": 0,
                    }
                ],
                "usageMetadata": {
                    "promptTokenCount": 5,
                    "candidatesTokenCount": 1,
                    "totalTokenCount": 6,
                },
                "modelVersion": "gemini-2.5-flash",
            },
        )

    provider_transport(monkeypatch, respond)
    owner = await signup(client, mailbox)
    other = await signup(client, mailbox, "other@example.com")
    for provider, model in [
        ("openai", "gpt-4o-mini"),
        ("anthropic", "claude-sonnet-4-20250514"),
        ("gemini", "gemini-2.5-flash"),
    ]:
        url = f"/v1/ai/credentials/{provider}"
        saved = await client.put(
            url, headers=owner.headers, json={"model": model, "apiKey": "provider-key-1234"}
        )
        assert saved.status_code == 200 and saved.json()["keyLastFour"] == "1234", saved.text
        assert "provider-key" not in saved.text and "secret_encrypted" not in saved.text
        checked = await client.post(url + "/test", headers=owner.headers)
        assert checked.status_code == 200, checked.text
        assert checked.json()["text"] == "OK"
        assert checked.json()["usage"]["units"] == 6
        assert checked.json()["usage"]["costEstimated"]
    assert len(requests) == 3
    async with admin_engine.connect() as admin:
        encrypted = (
            (await admin.execute(text("SELECT secret_encrypted FROM ai_credentials")))
            .scalars()
            .all()
        )
        assert len(encrypted) == 3 and all("provider-key" not in value for value in encrypted)
        rows = (
            await admin.execute(
                text(
                    "SELECT relrowsecurity,relforcerowsecurity FROM pg_class "
                    "WHERE relname IN ('ai_credentials','ai_usage')"
                )
            )
        ).all()
        assert len(rows) == 2 and all(row[0] and row[1] for row in rows)
    for path in ["/v1/ai/credentials", "/v1/ai/usage"]:
        assert (await client.get(path, headers=other.headers)).json() == []
    assert (
        await client.post("/v1/ai/credentials/openai/test", headers=other.headers)
    ).status_code == 404
    async with session_factory()() as db:
        await set_context(db, tenant_id=other.tenant_id, user_id=other.user_id)
        for table in ["ai_credentials", "ai_usage"]:
            assert await db.scalar(text(f"SELECT count(*) FROM {table}")) == 0
    agent = await accept_new(
        client, await invite(client, mailbox, owner, "agent@example.com", "agent")
    )
    assert (await client.get("/v1/ai/credentials", headers=agent)).status_code == 403
    url = "/v1/ai/credentials/openai"
    assert (
        await client.put(
            url, headers=owner.headers, json={"model": "gpt-4o-mini", "apiKey": "bad-key-1234"}
        )
    ).status_code == 200
    failed = await client.post(url + "/test", headers=owner.headers)
    assert (
        failed.status_code == 502 and failed.json()["error"]["code"] == "ai_authentication_failed"
    )
    assert "bad-key" not in failed.text and len(requests) == 4  # No automatic retries/fallback.
    history = (await client.get("/v1/ai/usage", headers=owner.headers)).json()
    assert len(history) == 4 and history[-1]["status"] == "failed"
    assert history[-1]["units"] is None and history[-1]["costUsd"] is None
    await client.put(url, headers=owner.headers, json={"model": "gpt-4o-mini", "enabled": False})
    assert (await client.post(url + "/test", headers=owner.headers)).status_code == 409
    assert (await client.delete(url, headers=owner.headers)).status_code == 204
    assert len((await client.get("/v1/ai/usage", headers=owner.headers)).json()) == 4


async def test_custom_ai_endpoint_and_unknown_usage(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await signup(client, mailbox)
    url = "/v1/ai/credentials/openai_compatible"
    data = {
        "model": "custom-chat",
        "apiKey": "custom-key-1234",
        "baseUrl": "https://models.example/v1",
    }
    assert (await client.put(url, headers=owner.headers, json=data)).status_code == 422
    monkeypatch.setattr(get_settings(), "ai_allowed_base_urls", [HttpUrl(data["baseUrl"])])
    for base in [
        "http://127.0.0.1/v1",
        "https://models.example/v1?key=secret",
        "https://models.example.evil/v1",
    ]:
        assert (
            await client.put(url, headers=owner.headers, json={**data, "baseUrl": base})
        ).status_code == 422
    assert (await client.put(url, headers=owner.headers, json=data)).status_code == 200
    requests: list[httpx.Request] = []
    redirect = False

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert str(request.url) == "https://models.example/v1/chat/completions"
        assert json.loads(request.content)["model"] == "custom-chat"
        assert request.headers["authorization"] == "Bearer custom-key-1234"
        if redirect:
            return httpx.Response(307, headers={"Location": "http://127.0.0.1/internal"})
        return httpx.Response(
            200,
            json={
                "id": "custom-1",
                "model": "custom-chat",
                "object": "chat.completion",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "Actual provider reply"},
                        "finish_reason": "stop",
                    }
                ],
            },
        )

    provider_transport(monkeypatch, respond)
    checked = await client.post(url + "/test", headers=owner.headers)
    assert checked.status_code == 200, checked.text
    assert checked.json()["text"] == "Actual provider reply"
    assert checked.json()["usage"]["costUsd"] is None and checked.json()["usage"]["units"] is None
    redirect = True
    assert (await client.post(url + "/test", headers=owner.headers)).status_code == 502
    assert len(requests) == 2
