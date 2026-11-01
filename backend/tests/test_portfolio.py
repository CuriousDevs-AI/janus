import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import Account, accept_new, invite, signup


def _bearer(pair: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {pair['access_token']}"}


async def _lead_with_deal(
    client: httpx.AsyncClient, headers: dict[str, str], key: str, amount: str, stage: str
) -> None:
    created = await client.post(
        "/v1/leads",
        headers={**headers, "Idempotency-Key": key},
        json={"name": f"Buyer {key}", "phone": f"98{abs(hash(key)) % 10**8:08d}"},
    )
    assert created.status_code == 201, created.text
    deal = await client.post(
        f"/v1/leads/{created.json()['id']}/deal",
        headers=headers,
        json={
            "name": "Order",
            "amount": amount,
            "stage": stage,
            "expectedCloseAt": "2026-12-01",
            **({"lostReason": "Price"} if stage == "lost" else {}),
        },
    )
    assert deal.status_code == 200, deal.text


async def _second_company(client: httpx.AsyncClient, owner: Account, name: str) -> dict[str, str]:
    created = await client.post(
        "/v1/portfolio/companies", headers=owner.headers, json={"name": name, "industry": "Retail"}
    )
    assert created.status_code == 201, created.text
    return created.json()


async def test_the_owner_sees_each_company_with_its_own_numbers(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    await _lead_with_deal(client, owner.headers, "a-1", "1000.50", "proposal")
    await _lead_with_deal(client, owner.headers, "a-2", "2000", "won")
    second = await _second_company(client, owner, "Pune Retail")
    switched = await client.post(
        "/v1/me/switch-tenant", headers=owner.headers, json={"tenant_id": int(second["id"])}
    )
    assert switched.status_code == 200, switched.text
    other = _bearer(switched.json())
    await _lead_with_deal(client, other, "b-1", "500", "new")

    response = await client.get("/v1/portfolio/summary", headers=other)
    assert response.status_code == 200, response.text
    companies = {item["name"]: item for item in response.json()["companies"]}
    assert set(companies) == {"Mumbai Traders", "Pune Retail"}
    first, retail = companies["Mumbai Traders"], companies["Pune Retail"]
    assert first["current"] is False and retail["current"] is True
    assert first["crm"] == {
        "leads": 2,
        "openDeals": 1,
        "wonDeals": 1,
        "lostDeals": 0,
        "pipelineValue": "1000.50",
        "wonValue": "2000.00",
    }
    assert retail["crm"]["leads"] == 1 and retail["crm"]["pipelineValue"] == "500.00"
    assert retail["industry"] == "Retail" and retail["members"] == 1
    # The session stays in its own company after reading the others.
    me = (await client.get("/v1/me", headers=other)).json()
    assert me["tenant"]["id"] == second["id"]
    assert len((await client.get("/v1/leads", headers=other)).json()) == 1
    async with admin_engine.connect() as connection:
        reads = (
            (
                await connection.execute(
                    text(
                        "SELECT tenant_id FROM audit_log WHERE action = 'portfolio.company_read'"
                        " ORDER BY tenant_id"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert reads == sorted([owner.tenant_id, int(second["id"])])


async def test_a_company_where_the_person_is_not_owner_is_left_out(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox, "owner@example.com")
    other = await signup(client, mailbox, "other@example.com")
    await _lead_with_deal(client, other.headers, "secret", "99999", "proposal")
    token = await invite(client, mailbox, other, owner.email)
    accepted = await client.post(f"/v1/invitations/{token}/accept", headers=owner.headers, json={})
    assert accepted.status_code == 200, accepted.text
    me = (await client.get("/v1/me", headers=owner.headers)).json()
    assert len(me["tenants"]) == 2

    names = [
        item["name"]
        for item in (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
            "companies"
        ]
    ]
    assert names == ["Mumbai Traders"]
    # As an agent of the other company, a sign-in there sees no Portfolio of it either.
    switched = await client.post(
        "/v1/me/switch-tenant", headers=owner.headers, json={"tenant_id": other.tenant_id}
    )
    agent_view = (
        await client.get("/v1/portfolio/summary", headers=_bearer(switched.json()))
    ).json()
    assert [item["name"] for item in agent_view["companies"]] == ["Mumbai Traders"]


async def test_only_an_owner_adds_a_company(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    refused = await client.post(
        "/v1/portfolio/companies", headers=agent, json={"name": "Side shop"}
    )
    assert refused.status_code == 403
    assert (await client.get("/v1/portfolio/summary", headers=agent)).json() == {"companies": []}
    short = await client.post(
        "/v1/portfolio/companies", headers=owner.headers, json={"name": " a "}
    )
    assert short.status_code == 422

    created = await _second_company(client, owner, "Nashik Foods")
    me = (await client.get("/v1/me", headers=owner.headers)).json()
    assert me["tenant"]["id"] == str(owner.tenant_id)
    assert {item["name"]: item["role"] for item in me["tenants"]} == {
        "Mumbai Traders": "owner",
        "Nashik Foods": "owner",
    }
    switched = await client.post(
        "/v1/me/switch-tenant", headers=owner.headers, json={"tenant_id": int(created["id"])}
    )
    assert switched.status_code == 200
    headers = _bearer(switched.json())
    assert (await client.get("/v1/leads", headers=headers)).json() == []
    assert any(
        item["type"] == "crm_sales"
        for item in (await client.get("/v1/workspaces", headers=headers)).json()
    )
