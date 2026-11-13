import json
from typing import Any

import httpx
import pytest

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup
from tests.test_ai import provider_transport

KEY = "sk-or-v1-portfolio-test-key-0001"


def _chat(text: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "chat-1",
            "object": "chat.completion",
            "created": 1,
            "model": "test-model",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12},
        },
    )


async def test_a_portfolio_key_is_kept_once_and_copied_into_chosen_companies(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[dict[str, Any]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        sent.append({"auth": request.headers.get("authorization"), **json.loads(request.content)})
        return _chat("Mumbai Traders needs you most.")

    provider_transport(monkeypatch, respond)
    owner = await signup(client, mailbox)
    second = await client.post(
        "/v1/portfolio/companies", headers=owner.headers, json={"name": "Pune Retail"}
    )
    assert second.status_code == 201, second.text
    pune = second.json()["id"]
    first = str(owner.tenant_id)

    saved = await client.put(
        "/v1/portfolio/ai-keys/openrouter",
        headers=owner.headers,
        json={"model": "vendor/model-a:free", "apiKey": KEY},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json() == [
        {
            "provider": "openrouter",
            "model": "vendor/model-a:free",
            "keyLastFour": "0001",
            "copiedTo": [],
        }
    ]
    assert KEY not in saved.text

    # It is a model for Janus Intelligence, and asking sends the key to the provider only.
    models = (await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)).json()
    assert "portfolio:openrouter" in [option["id"] for option in models["options"]]
    assert models["canAddKeys"] is True and KEY not in json.dumps(models)
    tested = await client.post("/v1/portfolio/ai-keys/openrouter/test", headers=owner.headers)
    assert tested.status_code == 200, tested.text
    asked = await client.post(
        "/v1/portfolio/intelligence/ask",
        headers=owner.headers,
        json={"question": "Who needs me?", "model": "portfolio:openrouter"},
    )
    assert asked.status_code == 200, asked.text
    assert sent[-1]["auth"] == f"Bearer {KEY}" and sent[-1]["model"] == "vendor/model-a:free"

    # Copied into both companies, each then keeps it as its own key.
    shared = await client.put(
        "/v1/portfolio/ai-keys/openrouter/companies",
        headers=owner.headers,
        json={"companies": [first, pune]},
    )
    assert [item["id"] for item in shared.json()[0]["copiedTo"]] == [first, pune]
    companies = (
        await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)
    ).json()["companies"]
    assert [[key["keyLastFour"] for key in item["keys"]] for item in companies] == [
        ["0001"],
        ["0001"],
    ]
    # The copies are the same key: "Answer with" offers it once, as the Portfolio's.
    offered = (await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)).json()[
        "options"
    ]
    assert [option["id"] for option in offered] == ["rules", "portfolio:openrouter"]
    company_test = await client.post(
        f"/v1/portfolio/companies/{pune}/ai/openrouter/test", headers=owner.headers
    )
    assert company_test.status_code == 200 and sent[-1]["auth"] == f"Bearer {KEY}"

    # A changed model reaches every copy; unticking a company takes its copy back.
    await client.put(
        "/v1/portfolio/ai-keys/openrouter", headers=owner.headers, json={"model": "vendor/model-b"}
    )
    companies = (
        await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)
    ).json()["companies"]
    assert {key["model"] for item in companies for key in item["keys"]} == {"vendor/model-b"}
    narrowed = await client.put(
        "/v1/portfolio/ai-keys/openrouter/companies",
        headers=owner.headers,
        json={"companies": [first]},
    )
    assert [item["id"] for item in narrowed.json()[0]["copiedTo"]] == [first]
    companies = (
        await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)
    ).json()["companies"]
    assert [len(item["keys"]) for item in companies] == [1, 0]

    # Someone who owns no company cannot keep Portfolio keys.
    member = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    refused = await client.put(
        "/v1/portfolio/ai-keys/groq",
        headers=member,
        json={"model": "m", "apiKey": "gsk_test_12345"},
    )
    assert refused.status_code == 403

    # Revoking takes it back from the companies too.
    revoked = await client.post(
        "/v1/portfolio/ai-keys/openrouter/revoke",
        headers=owner.headers,
        json={"fromCompanies": True},
    )
    assert revoked.status_code == 200 and revoked.json() == []
    companies = (
        await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)
    ).json()["companies"]
    assert [len(item["keys"]) for item in companies] == [0, 0]


def test_provider_errors_say_what_went_wrong() -> None:
    from litellm import exceptions

    from janus_api.ai.gateway import provider_error

    groq = exceptions.BadRequestError(
        message="OpenAIException - Invalid API Key", model="m", llm_provider="openai"
    )
    assert provider_error(groq).code == "ai_authentication_failed"
    google = exceptions.NotFoundError(
        message='GeminiException - {\n "error": {\n  "message": "This model models/x is no longer'
        ' available to new users.",\n  "status": "NOT_FOUND"}}',
        model="m",
        llm_provider="gemini",
    )
    gone = provider_error(google)
    assert gone.code == "ai_model_not_found" and "no longer available to new users" in gone.message
    busy = exceptions.ServiceUnavailableError(
        message="This model is currently experiencing high demand.",
        model="m",
        llm_provider="gemini",
    )
    assert provider_error(busy).code == "ai_busy"
    leaked = exceptions.BadRequestError(
        message="Bad request for key sk-or-v1-abcdefghijklmnop", model="m", llm_provider="openai"
    )
    assert "abcdefghijklmnop" not in provider_error(leaked).message
