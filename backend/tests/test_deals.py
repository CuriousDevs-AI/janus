"""One pipeline flow against real restricted Postgres roles."""

import asyncio
import os

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from janus_api.core.db import session_factory
from janus_api.core.tenancy import set_context
from janus_api.worker.service import run_once
from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


async def test_saved_pipeline(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    other = await signup(client, mailbox, "other@example.com")
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    source = (
        await client.post(
            "/v1/sources",
            headers=owner.headers,
            json={"name": "Pipeline enquiries", "connectionKind": "csv"},
        )
    ).json()
    response = await client.post(
        f"/v1/sources/{source['id']}/imports",
        headers={**owner.headers, "Content-Type": "text/csv", "Idempotency-Key": "deal-lead"},
        content="name,phone\nAsha,9876543210\n",
    )
    assert response.status_code == 202, response.text
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])
    try:
        assert await run_once(async_sessionmaker(engine, expire_on_commit=False))
    finally:
        await engine.dispose()
    lead = (await client.get("/v1/leads", headers=owner.headers)).json()[0]
    create_url = f"/v1/leads/{lead['id']}/deal"
    values = {
        "name": "Shop equipment",
        "amount": "12500.25",
        "stage": "new",
        "expectedCloseAt": "2026-12-01",
    }
    assert (await client.post(create_url, headers=other.headers, json=values)).status_code == 404
    assert (await client.post(create_url, headers=agent, json=values)).status_code == 404
    results = await asyncio.gather(
        *(client.post(create_url, headers=owner.headers, json=values) for _ in range(2))
    )
    assert all(result.status_code == 200 for result in results), [r.text for r in results]
    deal = results[0].json()
    assert results[1].json()["id"] == deal["id"] and deal["amount"] == "12500.25"
    url = f"/v1/deals/{deal['id']}"
    assert (await client.get("/v1/leads", headers=owner.headers)).json()[0]["dealId"] == deal["id"]
    assert len((await client.get("/v1/deals", headers=owner.headers)).json()) == 1
    assert (await client.get(url, headers=other.headers)).status_code == 404
    assert (await client.get(url + "/events", headers=agent)).status_code == 404
    assert (await client.get("/v1/deals", headers=agent)).json() == []
    changes = {**values, "stage": "qualified", "version": deal["version"]}
    results = await asyncio.gather(
        *(client.put(url, headers=owner.headers, json=changes) for _ in range(2))
    )
    assert sorted(r.status_code for r in results) == [200, 409]
    deal = (await client.get(url, headers=owner.headers)).json()
    assert deal["stage"] == "qualified" and deal["version"] == 2
    assert (await client.get(f"/v1/leads/{lead['id']}", headers=owner.headers)).json()[
        "stage"
    ] == "qualified"
    changes = {**values, "version": deal["version"]}
    for invalid in (
        {"amount": "1.001"},
        {"amount": "-1"},
        {"amount": "NaN"},
        {"stage": "invented"},
        {"stage": "lost", "lostReason": "   "},
        {"name": " "},
        {"ownerId": str(other.user_id)},
    ):
        assert (
            await client.put(url, headers=owner.headers, json={**changes, **invalid})
        ).status_code == 422
    assert (await client.put(url, headers=agent, json=changes)).status_code == 404
    # Deals inherit lead ownership, so assigning the lead grants that agent access.
    agent_id = (await client.get("/v1/me", headers=agent)).json()["user"]["id"]
    async with admin_engine.begin() as db:
        await db.execute(
            text("UPDATE leads SET owner_id = :owner WHERE id = :lead"),
            {"owner": int(agent_id), "lead": int(lead["id"])},
        )
    for stage in ["proposal", "negotiation", "won", "lost", "qualified"]:
        changes = {
            **values,
            "version": deal["version"],
            "stage": stage,
            "lostReason": "Budget deferred" if stage == "lost" else "",
        }
        response = await client.put(url, headers=agent, json=changes)
        assert response.status_code == 200, response.text
        deal = response.json()
    assert deal["lostReason"] == "" and deal["stage"] == "qualified"
    history = (await client.get(url + "/events", headers=agent)).json()
    assert len(history) == 7 and history[-1]["action"] == "deal.created"
    assert history[1]["details"]["lost_reason"] == "Budget deferred"
    assert history[-1]["details"]["name"] == values["name"]
    assert history[-1]["details"]["lead_id"] == lead["id"]
    older = (
        await client.get(url + f"/events?before_id={history[0]['id']}&limit=2", headers=agent)
    ).json()
    assert [event["id"] for event in older] == [event["id"] for event in history[1:3]]
    assert (
        await client.get(f"/v1/deals?after_id={deal['id']}", headers=owner.headers)
    ).json() == []
    async with session_factory()() as db:
        assert await db.scalar(text("SELECT count(*) FROM deals")) == 0
        await set_context(db, tenant_id=other.tenant_id, user_id=other.user_id)
        assert await db.scalar(text("SELECT count(*) FROM deals")) == 0
        assert not (await db.execute(text("UPDATE deals SET stage = 'won' RETURNING id"))).all()
    async with admin_engine.begin() as db:
        await db.execute(
            text("UPDATE memberships SET status = 'disabled' WHERE user_id = :user"),
            {"user": int(agent_id)},
        )
    assert (await client.put(url, headers=agent, json=changes)).status_code == 403


async def test_lost_reasons_are_counted(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await signup(client, mailbox)

    phones = {"lost-1": "9876500001", "lost-2": "9876500002", "lost-3": "9876500003"}

    async def lead(key: str) -> str:
        created = await client.post(
            "/v1/leads",
            headers={**owner.headers, "Idempotency-Key": key},
            json={"name": f"Buyer {key}", "phone": phones[key]},
        )
        assert created.status_code == 201, created.text
        return str(created.json()["id"])

    first, second, third = await lead("lost-1"), await lead("lost-2"), await lead("lost-3")
    url = f"/v1/leads/{first}"
    base = {"name": "Buyer lost-1", "phone": phones["lost-1"], "stage": "lost"}
    # A lost lead needs a reason; "other" needs a note.
    assert (await client.patch(url, headers=owner.headers, json=base)).status_code == 422
    other = {**base, "lostCategory": "other"}
    assert (await client.patch(url, headers=owner.headers, json=other)).status_code == 422
    marked = await client.patch(url, headers=owner.headers, json={**base, "lostCategory": "price"})
    assert marked.status_code == 200, marked.text
    assert marked.json()["lostCategory"] == "price" and marked.json()["lostAt"]
    # A deal lost for a reason passes it to its lead, with the deal's value.
    deal = await client.post(
        f"/v1/leads/{second}/deal",
        headers=owner.headers,
        json={"name": "Order", "amount": "5000.00", "stage": "proposal"},
    )
    lost = await client.put(
        f"/v1/deals/{deal.json()['id']}",
        headers=owner.headers,
        json={
            "name": "Order",
            "amount": "5000.00",
            "stage": "lost",
            "lostCategory": "price",
            "lostReason": "Wanted 20% off",
            "version": 1,
        },
    )
    assert lost.status_code == 200, lost.text
    assert lost.json()["lostCategory"] == "price"
    lead_two = (await client.get(f"/v1/leads/{second}", headers=owner.headers)).json()
    assert lead_two["stage"] == "lost" and lead_two["lostReason"] == "Wanted 20% off"
    # An older client's free-text reason counts as "other".
    third_lost = await client.patch(
        f"/v1/leads/{third}",
        headers=owner.headers,
        json={
            "name": "Buyer lost-3",
            "phone": phones["lost-3"],
            "stage": "lost",
            "lostReason": "Moved city",
        },
    )
    assert third_lost.json()["lostCategory"] == "other"
    reasons = (await client.get("/v1/lost-reasons", headers=owner.headers)).json()
    assert reasons[0] == {
        "category": "price",
        "label": "Price too high",
        "count": 2,
        "value": "5000.00",
    }
    assert reasons[1]["category"] == "other" and reasons[1]["count"] == 1
    # Reopening a lead clears why it was lost.
    reopened = await client.patch(url, headers=owner.headers, json={**base, "stage": "qualified"})
    assert reopened.json()["lostCategory"] is None and reopened.json()["lostAt"] is None
