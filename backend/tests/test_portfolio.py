from datetime import date, timedelta

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from janus_api.portfolio.service import period_for, today_ist
from tests.conftest import Mailbox
from tests.helpers import PASSWORD, Account, accept_new, invite, signup


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
    assert (await client.get("/v1/portfolio/summary", headers=agent)).json()["companies"] == []
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


async def test_money_shows_what_is_owed_and_how_late(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    today = today_ist()

    def day(offset: int) -> str:
        return (today + timedelta(days=offset)).isoformat()

    line = {"item": "Staples", "hsn": "1904", "qty": 1, "rate_paise": 100000, "gst_rate": 0}
    invoices = []
    for key, due in (("late-10", -10), ("late-45", -45), ("not-due", 10)):
        created = await client.post(
            "/v1/finance/invoices",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "customer": "Kavita Rao",
                "invoice_date": day(-70),
                "due_date": day(due),
                "same_state": True,
                "lines": [line],
            },
        )
        assert created.status_code == 201, created.text
        invoices.append(created.json())
    paid = await client.post(
        f"/v1/finance/invoices/{invoices[0]['id']}/payments",
        headers={**owner.headers, "Idempotency-Key": "pay-1"},
        json={"amount_paise": 40000, "method": "UPI", "reference": "UPI-1", "paid_on": day(0)},
    )
    assert paid.status_code == 201, paid.text
    for key, due in (("bill-soon", 3), ("bill-later", 20)):
        bill = await client.post(
            "/v1/finance/bills",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "vendor": "Packaging Co",
                "vendor_bill_no": key,
                "bill_date": day(-5),
                "due_date": day(due),
                "amount_paise": 50000,
            },
        )
        assert bill.status_code == 201, bill.text
    await _second_company(client, owner, "Pune Retail")

    companies = {
        item["name"]: item["money"]
        for item in (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
            "companies"
        ]
    }
    money = companies["Mumbai Traders"]
    assert money["receivable"] == "2600.00" and money["overdue"] == "1600.00"
    assert money["overdueInvoices"] == 2
    assert money["ageing"] == {"days0to30": "600.00", "days31to60": "1000.00", "over60": "0.00"}
    assert money["payable"] == "1000.00" and money["payableDueThisWeek"] == "500.00"
    assert "collectedThisMonth" not in money
    assert companies["Pune Retail"]["receivable"] == "0.00"


async def _join(client: httpx.AsyncClient, mailbox: Mailbox, address: str) -> dict[str, str]:
    """Accepts the newest invitation for the address, as a new account or an existing one."""
    token = mailbox.token(address, "invite")
    accepted = await client.post(
        f"/v1/invitations/{token}/accept", json={"name": "Group CFO", "password": PASSWORD}
    )
    assert accepted.status_code == 200, accepted.text
    return _bearer(accepted.json())


async def test_an_owner_shares_the_portfolio_with_a_group_role(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    second = await _second_company(client, owner, "Pune Retail")
    await _second_company(client, owner, "Nagpur Hardware")

    # Only companies the caller owns can be shared.
    stranger = await signup(client, mailbox, "stranger@example.com")
    refused = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={
            "email": "cfo@example.com",
            "role": "group_finance",
            "companies": [str(stranger.tenant_id)],
        },
    )
    assert refused.status_code == 403

    shared = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={
            "email": "cfo@example.com",
            "role": "group_analyst",
            "companies": [str(owner.tenant_id), second["id"]],
        },
    )
    assert shared.status_code == 200, shared.text
    assert shared.json() == {"done": ["Mumbai Traders", "Pune Retail"], "skipped": []}
    again = (
        await client.post(
            "/v1/portfolio/access",
            headers=owner.headers,
            json={"email": "cfo@example.com", "role": "group_analyst", "companies": [second["id"]]},
        )
    ).json()
    assert again["done"] == [] and again["skipped"][0]["company"] == "Pune Retail"

    listed = (await client.get("/v1/portfolio/access", headers=owner.headers)).json()["people"]
    assert [(c["name"], c["status"]) for c in listed[0]["companies"]] == [
        ("Mumbai Traders", "invited"),
        ("Pune Retail", "invited"),
    ]

    analyst = await _join(client, mailbox, "cfo@example.com")
    view = (await client.get("/v1/portfolio/summary", headers=analyst)).json()["companies"]
    # The analyst sees only what was shared, and no money.
    assert len(view) == 1 and view[0]["money"] is None
    me = (await client.get("/v1/me", headers=analyst)).json()
    assert "portfolio:read" in me["permissions"] and "leads:read_own" not in me["permissions"]
    assert (await client.get("/v1/leads", headers=analyst)).status_code == 403
    # An analyst cannot share the Portfolio or add a company.
    assert (await client.get("/v1/portfolio/access", headers=analyst)).json() == {"people": []}
    assert (
        await client.post("/v1/portfolio/companies", headers=analyst, json={"name": "Side shop"})
    ).status_code == 403

    removed = await client.post(
        "/v1/portfolio/access/remove", headers=owner.headers, json={"email": "cfo@example.com"}
    )
    assert removed.status_code == 200, removed.text
    assert set(removed.json()["done"]) == {"Mumbai Traders", "Pune Retail"}
    assert (await client.get("/v1/portfolio/access", headers=owner.headers)).json() == {
        "people": []
    }
    assert (await client.get("/v1/me", headers=analyst)).status_code == 403


async def test_group_finance_sees_money_and_a_co_owner_stays_on_removal(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    shared = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "cfo@example.com", "role": "group_finance"},
    )
    assert shared.json()["done"] == ["Mumbai Traders"]
    finance = await _join(client, mailbox, "cfo@example.com")
    view = (await client.get("/v1/portfolio/summary", headers=finance)).json()["companies"]
    assert view[0]["money"]["receivable"] == "0.00"

    await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "partner@example.com", "role": "owner"},
    )
    await _join(client, mailbox, "partner@example.com")
    removed = (
        await client.post(
            "/v1/portfolio/access/remove",
            headers=owner.headers,
            json={"email": "partner@example.com"},
        )
    ).json()
    assert removed["done"] == [] and "Co-owner" in removed["skipped"][0]["reason"]


def test_periods_compare_to_date_with_the_same_days_before() -> None:
    def bounds(key: str, day: str) -> tuple[str, str, str, str, str]:
        period = period_for(key, date.fromisoformat(day))
        return (period.label, period.start, period.end, period.previousStart, period.previousEnd)

    assert bounds("month", "2026-11-02") == (
        "Nov 2026",
        "2026-11-01",
        "2026-11-02",
        "2026-10-01",
        "2026-10-02",
    )
    # A longer month than the one before stops at that month's end.
    assert bounds("month", "2026-03-31")[3:] == ("2026-02-01", "2026-02-28")
    assert bounds("quarter", "2026-11-02") == (
        "Q3 (Oct-Dec)",
        "2026-10-01",
        "2026-11-02",
        "2026-07-01",
        "2026-08-02",
    )
    assert bounds("quarter", "2027-01-15")[:2] == ("Q4 (Jan-Mar)", "2027-01-01")
    assert bounds("quarter", "2027-01-15")[3] == "2026-10-01"
    assert bounds("fy", "2026-11-02") == (
        "FY 2026-27",
        "2026-04-01",
        "2026-11-02",
        "2025-04-01",
        "2025-11-02",
    )
    assert bounds("fy", "2027-02-10")[:2] == ("FY 2026-27", "2026-04-01")


async def test_the_period_counts_what_happened_in_it(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    today = today_ist()
    await _lead_with_deal(client, owner.headers, "p-1", "750", "won")
    line = {"item": "Staples", "hsn": "1904", "qty": 1, "rate_paise": 100000, "gst_rate": 0}
    invoice = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "p-inv"},
        json={
            "customer": "Kavita Rao",
            "invoice_date": today.isoformat(),
            "due_date": (today + timedelta(days=15)).isoformat(),
            "same_state": True,
            "lines": [line],
        },
    )
    assert invoice.status_code == 201, invoice.text
    paid = await client.post(
        f"/v1/finance/invoices/{invoice.json()['id']}/payments",
        headers={**owner.headers, "Idempotency-Key": "p-pay"},
        json={
            "amount_paise": 25000,
            "method": "UPI",
            "reference": "UPI-2",
            "paid_on": today.isoformat(),
        },
    )
    assert paid.status_code == 201, paid.text

    for key in ("month", "quarter", "fy"):
        body = (
            await client.get(f"/v1/portfolio/summary?period={key}", headers=owner.headers)
        ).json()
        assert body["period"]["key"] == key and body["period"]["end"] == today.isoformat()
        figures = body["companies"][0]["period"]
        assert figures["current"] == {
            "leads": 1,
            "wonDeals": 1,
            "wonValue": "750.00",
            "invoiced": "1000.00",
            "collected": "250.00",
        }
        assert figures["previous"]["leads"] == 0
    bad = await client.get("/v1/portfolio/summary?period=week", headers=owner.headers)
    assert bad.status_code == 422

    await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "analyst@example.com", "role": "group_analyst"},
    )
    analyst = await _join(client, mailbox, "analyst@example.com")
    figures = (await client.get("/v1/portfolio/summary", headers=analyst)).json()["companies"][0]
    assert figures["period"]["current"]["invoiced"] is None
    assert figures["period"]["current"]["leads"] == 1
