import json
import re
from typing import Any

import httpx
import pytest
from pydantic import HttpUrl
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from janus_api.core.config import get_settings
from tests.conftest import Mailbox
from tests.helpers import signup
from tests.test_ai import provider_transport


def _chat(content: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "call-1",
            "model": "gpt-4o-mini",
            "object": "chat.completion",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 900, "completion_tokens": 40, "total_tokens": 940},
        },
    )


async def test_a_model_answers_only_from_the_portfolio_and_cites_it(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = await signup(client, mailbox)
    models = await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)
    assert models.status_code == 200, models.text
    assert [option["id"] for option in models.json()["options"]] == ["rules"]
    company = models.json()["companies"][0]
    assert company["keys"] == [] and company["capUsd"] == "5"

    saved = await client.put(
        f"/v1/portfolio/companies/{company['id']}/ai/openai",
        headers=owner.headers,
        json={"model": "gpt-4o-mini", "apiKey": "sk-test-key-1234"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["keyLastFour"] == "1234" and "apiKey" not in saved.json()
    options = (await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)).json()
    model = f"{company['id']}:openai"
    assert [option["id"] for option in options["options"]] == ["rules", model]

    fact = await client.post(
        "/v1/portfolio/knowledge",
        headers=owner.headers,
        json={
            "companyId": company["id"],
            "kind": "fact",
            "title": "Payments",
            "body": "GST is filed by our CA, Mehta and Co.",
        },
    )
    assert fact.status_code == 201, fact.text
    document = await client.post(
        "/v1/portfolio/knowledge",
        headers=owner.headers,
        json={
            "companyId": company["id"],
            "kind": "document",
            "title": "Refund policy",
            "body": "Refunds are given within 14 days of delivery. " * 40
            + "\n\nWarranty covers motors for two years.",
        },
    )
    assert document.status_code == 201, document.text
    assert len(document.json()) == 2  # kept in passages

    sent: list[dict[str, Any]] = []
    replies = iter(
        [
            "Refunds are given within 14 days [D1]. Sales this period are {sales} [{sales_id}].\n"
            "REMEMBER Mumbai Traders: Pays suppliers on the 20th.",
            "Same as before [{sales_id}].",
        ]
    )

    def respond(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append(body)
        system = body["messages"][0]["content"]
        sales_id = re.search(r"\[(F\d+)\] Mumbai Traders sales this period", system)
        assert sales_id, system
        return _chat(next(replies).format(sales="₹0", sales_id=sales_id.group(1)))

    provider_transport(monkeypatch, respond)
    asked = await client.post(
        "/v1/portfolio/intelligence/ask",
        headers=owner.headers,
        json={"question": "What is our refund policy, and how are sales?", "model": model},
    )
    assert asked.status_code == 200, asked.text
    answer = asked.json()
    system = sent[0]["messages"][0]["content"]
    assert "Use ONLY the numbered facts" in system
    assert "[K1] Mumbai Traders: GST is filed by our CA" in system
    assert '[D1] Mumbai Traders, from "Refund policy"' in system
    assert "REMEMBER" not in answer["answer"]
    assert answer["grounded"] is True
    assert [source["id"][0] for source in answer["sources"]] == ["D", "F"]
    assert answer["suggested"] == ["Mumbai Traders: Pays suppliers on the 20th."]
    assert answer["model"] == "gpt-4o-mini (openai)"

    knowledge = (await client.get("/v1/portfolio/knowledge", headers=owner.headers)).json()
    suggested = [item for item in knowledge if item["status"] == "suggested"]
    assert [item["body"] for item in suggested] == ["Pays suppliers on the 20th."]

    # A follow-up carries the earlier question and answer.
    again = await client.post(
        "/v1/portfolio/intelligence/ask",
        headers=owner.headers,
        json={"question": "And now?", "model": model},
    )
    assert again.status_code == 200, again.text
    roles = [message["role"] for message in sent[1]["messages"]]
    assert roles == ["system", "user", "assistant", "user"]
    assert "[K" in sent[1]["messages"][0]["content"]
    # The suggested fact is not used until the owner approves it.
    assert "Pays suppliers on the 20th" not in sent[1]["messages"][0]["content"]
    approved = await client.put(
        f"/v1/portfolio/companies/{company['id']}/knowledge/{suggested[0]['id']}/approve",
        headers=owner.headers,
    )
    assert approved.status_code == 204, approved.text

    history = (await client.get("/v1/portfolio/intelligence/history", headers=owner.headers)).json()
    assert [item["question"] for item in history] == [
        "What is our refund policy, and how are sales?",
        "And now?",
    ]
    cleared = await client.delete("/v1/portfolio/intelligence/history", headers=owner.headers)
    assert cleared.status_code == 204
    assert (
        await client.get("/v1/portfolio/intelligence/history", headers=owner.headers)
    ).json() == []

    # Asked from Business Management: only that company's records, and only a company of theirs.
    provider_transport(monkeypatch, lambda request: _chat("Sales are steady."))
    scoped = await client.post(
        "/v1/portfolio/intelligence/ask",
        headers=owner.headers,
        json={"question": "Sales?", "model": model, "companyId": company["id"]},
    )
    assert scoped.status_code == 200, scoped.text
    elsewhere = await client.post(
        "/v1/portfolio/intelligence/ask",
        headers=owner.headers,
        json={"question": "Sales?", "model": model, "companyId": "999999"},
    )
    assert elsewhere.status_code == 404, elsewhere.text
    # From a department's chat, the model is told which figures to lead with.
    prompts: list[str] = []

    def department(request: httpx.Request) -> httpx.Response:
        prompts.append(json.loads(request.content)["messages"][0]["content"])
        return _chat("Nobody is on leave today.")

    provider_transport(monkeypatch, department)
    hr = await client.post(
        "/v1/portfolio/intelligence/ask",
        headers=owner.headers,
        json={"question": "Leave?", "model": model, "companyId": company["id"], "topic": "people"},
    )
    assert hr.status_code == 200, hr.text
    assert "Asked from the HR & People" in prompts[0]

    # Janus rules answer on the page, not here; a spent budget stops the model.
    rules = await client.post(
        "/v1/portfolio/intelligence/ask",
        headers=owner.headers,
        json={"question": "Sales?", "model": "rules"},
    )
    assert rules.status_code == 422
    monkeypatch.setattr(get_settings(), "portfolio_ai_monthly_usd", 0)
    capped = await client.post(
        "/v1/portfolio/intelligence/ask",
        headers=owner.headers,
        json={"question": "Sales?", "model": model},
    )
    assert capped.status_code == 429 and capped.json()["error"]["code"] == "ai_budget_reached"
    monkeypatch.setattr(get_settings(), "portfolio_ai_monthly_usd", 5)
    # Two questions were asked today; clearing the history does not reset the count.
    monkeypatch.setattr(get_settings(), "portfolio_ai_daily_questions", 2)
    limited = await client.post(
        "/v1/portfolio/intelligence/ask",
        headers=owner.headers,
        json={"question": "Sales?", "model": model},
    )
    assert limited.status_code == 429 and limited.json()["error"]["code"] == "question_limit"


async def test_a_local_model_server_needs_the_operator_to_allow_it(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = await signup(client, mailbox)
    company = (await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)).json()[
        "companies"
    ][0]
    url = f"/v1/portfolio/companies/{company['id']}/ai/openai_compatible"
    ollama = {"model": "llama3.1", "apiKey": "ollama-local", "baseUrl": "http://localhost:11434/v1"}
    refused = await client.put(url, headers=owner.headers, json=ollama)
    assert refused.status_code == 422, refused.text
    monkeypatch.setattr(
        get_settings(),
        "ai_allowed_base_urls",
        [HttpUrl(ollama["baseUrl"]), HttpUrl("http://models.example/v1")],
    )
    plain = await client.put(
        url, headers=owner.headers, json={**ollama, "baseUrl": "http://models.example/v1"}
    )
    assert plain.status_code == 422, plain.text  # plain HTTP only on this machine
    allowed = await client.put(url, headers=owner.headers, json=ollama)
    assert allowed.status_code == 200, allowed.text
    options = (await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)).json()
    local = options["options"][1]
    assert local["free"] is True and local["label"] == "llama3.1"


async def test_free_providers_each_keep_their_own_key_and_fixed_address(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = await signup(client, mailbox)
    listed = (await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)).json()
    free = {item["id"]: item for item in listed["free"]}
    assert {"openrouter", "gemini", "groq", "cerebras", "mistral", "huggingface"} <= set(free)
    assert free["openrouter"]["baseUrl"] == "https://openrouter.ai/api/v1"
    assert all(model.endswith(":free") for model in free["openrouter"]["models"])
    company = listed["companies"][0]["id"]
    for provider, model in (
        ("openrouter", "meta-llama/llama-3.3-70b-instruct:free"),
        ("groq", "llama-3.3-70b-versatile"),
    ):
        saved = await client.put(
            f"/v1/portfolio/companies/{company}/ai/{provider}",
            headers=owner.headers,
            json={"model": model, "apiKey": f"{provider}-key-1234"},
        )
        assert saved.status_code == 200, saved.text
    # No address is accepted for a built-in provider: it always uses the official one.
    moved = await client.put(
        f"/v1/portfolio/companies/{company}/ai/groq",
        headers=owner.headers,
        json={"model": "x", "baseUrl": "https://evil.example/v1"},
    )
    assert moved.status_code == 422
    options = (await client.get("/v1/portfolio/intelligence/models", headers=owner.headers)).json()
    shown = {option["id"]: option for option in options["options"]}
    assert shown[f"{company}:openrouter"]["free"] is True
    assert shown[f"{company}:groq"]["free"] is True

    hosts: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        hosts.append(f"{request.url.host}{request.url.path}")
        return _chat("Nothing on record answers that.")

    provider_transport(monkeypatch, respond)
    for provider in ("openrouter", "groq"):
        asked = await client.post(
            "/v1/portfolio/intelligence/ask",
            headers=owner.headers,
            json={"question": "How are sales?", "model": f"{company}:{provider}"},
        )
        assert asked.status_code == 200, asked.text
    assert hosts == [
        "openrouter.ai/api/v1/chat/completions",
        "api.groq.com/openai/v1/chat/completions",
    ]


async def test_quiet_leads_are_open_leads_nobody_has_touched_for_three_days(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    for key, name in (("quiet-1", "Meera Traders"), ("fresh-1", "Ravi Textiles")):
        made = await client.post(
            "/v1/leads",
            headers={**owner.headers, "Idempotency-Key": key},
            json={"name": name, "phone": "98765432" + ("10" if key == "quiet-1" else "11")},
        )
        assert made.status_code == 201, made.text
    async with admin_engine.begin() as connection:
        await connection.execute(
            text(
                "UPDATE leads SET last_activity_at = now() - interval '5 days' WHERE contact_id ="
                " (SELECT id FROM contacts WHERE name = 'Meera Traders')"
            )
        )
    crm = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()["companies"][0][
        "crm"
    ]
    assert crm["quietLeads"] == 1
    [quiet] = crm["quietList"]
    # Counted in whole days in India, so five days ago is 5 or, near midnight, 6.
    assert quiet["name"] == "Meera Traders" and quiet["days"] in (5, 6)
