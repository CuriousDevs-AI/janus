import os
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from janus_api.portfolio.compliance.due_dates import Profile, dues, status
from janus_api.portfolio.digest import day, next_due
from janus_api.portfolio.digest import run_once as digest_once
from janus_api.portfolio.periods import inr, period_for, today_ist
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
    # Neither bill is past its due date yet.
    assert money["payableLate"] == "0.00"
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
    # One link joins every company shared with them, and only those (not Nagpur Hardware), with
    # no money.
    assert {item["name"] for item in view} == {"Mumbai Traders", "Pune Retail"}
    assert all(item["money"] is None for item in view)
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
            "invoices": 1,
        }
        assert figures["previous"]["leads"] == 0
    bad = await client.get("/v1/portfolio/summary?period=day", headers=owner.headers)
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


def test_the_digest_goes_out_on_monday_morning_in_india() -> None:
    ist = ZoneInfo("Asia/Kolkata")
    monday_early = datetime(2026, 11, 2, 8, 0, tzinfo=ist)
    assert next_due(monday_early) == datetime(2026, 11, 2, 9, 0, tzinfo=ist)
    assert next_due(datetime(2026, 11, 2, 9, 0, tzinfo=ist)) == datetime(2026, 11, 9, 9, tzinfo=ist)
    sunday_night_utc = datetime(2026, 11, 8, 20, 0, tzinfo=UTC)  # Monday 01:30 in India
    assert next_due(sunday_night_utc) == datetime(2026, 11, 9, 9, 0, tzinfo=ist)
    assert [inr(v) for v in ("0", "950.5", "12500", "123456", "25000000")] == [
        "₹0",
        "₹951",
        "₹12,500",
        "₹1.2L",
        "₹2.5Cr",
    ]
    assert inr("1234567.00") == "₹12.3L" and inr("99999") == "₹99,999"
    assert day("2026-10-26") == "26 Oct 2026"


async def test_the_digest_setting_and_what_it_says(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (await client.get("/v1/portfolio/digest", headers=agent)).json()["eligible"] is False
    refused = await client.put("/v1/portfolio/digest", headers=agent, json={"enabled": True})
    assert refused.status_code == 403

    off = (await client.get("/v1/portfolio/digest", headers=owner.headers)).json()
    assert off == {"enabled": False, "eligible": True, "nextDueAt": None, "lastSentAt": None}
    on = await client.put("/v1/portfolio/digest", headers=owner.headers, json={"enabled": True})
    assert on.status_code == 200, on.text
    due = datetime.fromisoformat(on.json()["nextDueAt"]).astimezone(ZoneInfo("Asia/Kolkata"))
    assert on.json()["enabled"] and due.weekday() == 0 and (due.hour, due.minute) == (9, 0)

    await _lead_with_deal(client, owner.headers, "d-1", "120000", "won")
    # The digest reports the week ending yesterday, so the records move into it.
    async with admin_engine.begin() as connection:
        await connection.execute(text("UPDATE leads SET created_at = now() - interval '1 day'"))
        await connection.execute(text("UPDATE deals SET updated_at = now() - interval '1 day'"))
    preview = (await client.get("/v1/portfolio/digest/preview", headers=owner.headers)).json()
    assert preview["subject"] == "Your week across 1 company"
    assert "Mumbai Traders" in preview["body"]
    assert "Deals won: 1, worth ₹1.2L" in preview["body"]
    assert "Customers owe: ₹0" in preview["body"]

    await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "analyst@example.com", "role": "group_analyst"},
    )
    analyst = await _join(client, mailbox, "analyst@example.com")
    body = (await client.get("/v1/portfolio/digest/preview", headers=analyst)).json()["body"]
    assert "Leads in: 1" in body and "Customers owe" not in body
    assert (await client.get("/v1/portfolio/digest/preview", headers=agent)).status_code == 404


async def test_the_worker_sends_a_due_digest_once(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    other = await signup(client, mailbox, "quiet@example.com")
    for account, enabled in ((owner, True), (other, False)):
        await client.put("/v1/portfolio/digest", headers=account.headers, json={"enabled": True})
        if not enabled:
            await client.put(
                "/v1/portfolio/digest", headers=account.headers, json={"enabled": False}
            )
    async with admin_engine.begin() as connection:
        await connection.execute(
            text("UPDATE portfolio_digests SET next_due_at = now() - interval '1 minute'")
        )
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        assert await digest_once(factory)
        assert not await digest_once(factory)
    finally:
        await engine.dispose()
    sent = [(to, subject) for to, subject, _ in mailbox.messages if "week across" in subject]
    assert sent == [("owner@example.com", "Your week across 1 company")]
    async with admin_engine.connect() as connection:
        row = (
            await connection.execute(
                text(
                    "SELECT d.last_sent_at, d.next_due_at FROM portfolio_digests d"
                    " JOIN users u ON u.id = d.user_id WHERE u.email = 'owner@example.com'"
                )
            )
        ).one()
        reads = await connection.scalar(
            text("SELECT count(*) FROM audit_log WHERE action = 'portfolio.digest_sent'")
        )
    assert row.last_sent_at is not None and row.next_due_at > row.last_sent_at
    assert reads == 1


def test_the_compliance_calendar_follows_the_statutory_dates() -> None:
    everything = Profile("monthly", tds=True, pf_esi=True, company=True)
    october = [
        (due.key, due.due_on.isoformat())
        for due in dues(everything, date(2026, 10, 1), date(2026, 10, 31))
    ]
    assert october == [
        ("tds_2026-09", "2026-10-07"),
        ("gstr1_2026-09", "2026-10-11"),
        ("pf_2026-09", "2026-10-15"),
        ("esi_2026-09", "2026-10-15"),
        ("gstr3b_2026-09", "2026-10-20"),
        ("aoc4_2025", "2026-10-30"),
        ("tdsr_2026q2", "2026-10-31"),
        ("itr_2025", "2026-10-31"),
    ]
    quarterly = Profile("quarterly", tds=True, pf_esi=False, company=False)
    keys = {due.key: due.due_on for due in dues(quarterly, date(2026, 4, 1), date(2026, 10, 31))}
    assert keys["gstr1q_2026q2"] == date(2026, 10, 13)
    assert keys["gstr3bq_2026q2"] == date(2026, 10, 22)
    # TDS deducted in March is paid by 30 April, not 7 April.
    assert keys["tds_2026-03"] == date(2026, 4, 30)
    assert status(date(2026, 10, 20), False, date(2026, 11, 2)) == "overdue"
    assert status(date(2026, 11, 7), False, date(2026, 11, 2)) == "due_soon"
    assert status(date(2026, 11, 20), False, date(2026, 11, 2)) == "upcoming"
    assert status(date(2026, 10, 20), True, date(2026, 11, 2)) == "filed"


async def test_the_operating_view_attention_and_health(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    today = today_ist()
    employee = {"title": "Staff", "department": "Sales", "managerId": None, "status": "active"}
    seeded = await client.post(
        "/v1/hr/records/seed",
        headers=owner.headers,
        json={
            "records": {
                "employee": [
                    {
                        **employee,
                        "id": "emp-001",
                        "name": "Owner",
                        "email": "owner@example.com",
                        "salaryMonthly": 50000,
                    },
                    {
                        **employee,
                        "id": "emp-002",
                        "name": "Asha",
                        "email": "asha@example.com",
                        "salaryMonthly": 30000,
                        "managerId": "emp-001",
                    },
                    {
                        **employee,
                        "id": "emp-003",
                        "name": "Left",
                        "email": "left@example.com",
                        "salaryMonthly": 99000,
                        "status": "archived",
                    },
                ],
                "leave": [
                    {
                        "id": "leave-1",
                        "employeeId": "emp-002",
                        "managerId": "emp-001",
                        "from": "2026-12-10",
                        "to": "2026-12-11",
                        "status": "pending",
                    }
                ],
            }
        },
    )
    assert seeded.status_code in (200, 201), seeded.text
    item = {
        "name": "Flour 5 kg",
        "unit": "bag",
        "hsn": "1101",
        "rate_paise": 45000,
        "gst_rate": 5,
        "reorder_level": 500,
    }
    opening = await client.post(
        "/v1/operations/import",
        headers=owner.headers,
        json={
            "items": [
                {**item, "key": "itm-1", "sku": "FL-1", "track_batch": False},
                {**item, "key": "itm-2", "sku": "FL-2", "track_batch": True},
            ],
            "batches": [
                {
                    "key": "bat-1",
                    "item_key": "itm-2",
                    "batch_no": "B-1",
                    "expiry": (today + timedelta(days=10)).isoformat(),
                }
            ],
            "movements": [
                {
                    "key": "mv-1",
                    "item_key": "itm-1",
                    "location_id": 1,
                    "qty": 100,
                    "reason": "Opening stock",
                    "booked_on": today.isoformat(),
                },
                {
                    "key": "mv-2",
                    "item_key": "itm-2",
                    "location_id": 1,
                    "batch_no": "B-1",
                    "qty": 900,
                    "reason": "Opening stock",
                    "booked_on": today.isoformat(),
                },
            ],
        },
    )
    assert opening.status_code in (200, 201), opening.text
    project = await client.post(
        "/v1/project-records",
        headers=owner.headers,
        json={
            "external_key": "prj-1",
            "name": "Dock layout",
            "client": "Internal",
            "status": "active",
            "budget": "1000.00",
            "start_on": (today - timedelta(days=30)).isoformat(),
            "end_on": (today - timedelta(days=1)).isoformat(),
        },
    )
    assert project.status_code == 201, project.text
    ticket = await client.post(
        "/v1/support/tickets",
        headers=owner.headers,
        json={
            "external_key": "tck-1",
            "number": "#1",
            "subject": "Wrong total",
            "priority": "urgent",
        },
    )
    assert ticket.status_code == 201, ticket.text

    company_id = str(owner.tenant_id)
    plan = await client.put(
        f"/v1/portfolio/companies/{company_id}/compliance",
        headers=owner.headers,
        json={"gstin": "27aapfu0939f1zv", "gstFiling": "monthly"},
    )
    assert plan.status_code == 200, plan.text
    assert plan.json()["gstin"] == "27AAPFU0939F1ZV"
    bad = await client.put(
        f"/v1/portfolio/companies/{company_id}/compliance",
        headers=owner.headers,
        json={"gstin": "NOT-A-GSTIN", "gstFiling": "monthly"},
    )
    assert bad.status_code == 422
    targets = await client.put(
        f"/v1/portfolio/companies/{company_id}/targets",
        headers=owner.headers,
        json={"leads": "40", "wonValue": "500000", "collected": "300000"},
    )
    assert targets.json() == {"leads": "40.00", "wonValue": "500000.00", "collected": "300000.00"}

    company = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
        "companies"
    ][0]
    assert company["people"] == {
        "headcount": 2,
        "onLeaveToday": 0,
        "pendingLeave": 1,
        "pendingClaims": 0,
        "monthlyPayroll": "80000.00",
        "claimsValue": "0.00",
    }
    assert company["stock"]["items"] == 2 and company["stock"]["belowReorder"] == 1
    assert company["stock"]["expiringBatches"] == 1
    assert company["stock"]["stockValue"] == "450000.00"
    assert company["delivery"]["lateProjects"] == 1
    assert company["support"]["urgent"] == 1
    assert [(a["kind"], a["count"]) for a in company["approvals"]] == [("leave", 1)]
    overdue = [due for due in company["compliance"] if due["status"] == "overdue"]
    assert overdue and all(due["dueOn"] < today.isoformat() for due in overdue)
    assert company["health"]["status"] == "red"
    texts = [item["text"] for item in company["attention"]]
    # No sales against ₹80,000 of monthly salaries: a loss once salaries are counted.
    assert any(
        text.startswith("Losing about ₹") and "once salaries are counted" in text for text in texts
    )
    assert any("past the end date" in text for text in texts)
    assert any("urgent" in text for text in texts)
    assert company["attention"][0]["severity"] == "high"
    assert "1 approval waiting: 1 leave request" in texts
    # Every overdue filing is one line, not one line each.
    filing_lines = [text for text in texts if "not recorded as filed, the oldest" in text]
    assert len(filing_lines) == 1 and filing_lines[0].startswith(f"{len(overdue)} filing")

    first = overdue[0]
    marked = await client.put(
        f"/v1/portfolio/companies/{company_id}/filings/{first['key']}",
        headers=owner.headers,
        json={"filedOn": today.isoformat()},
    )
    assert marked.status_code == 204, marked.text
    future = await client.put(
        f"/v1/portfolio/companies/{company_id}/filings/{first['key']}",
        headers=owner.headers,
        json={"filedOn": (today + timedelta(days=1)).isoformat()},
    )
    assert future.status_code == 422
    unknown = await client.put(
        f"/v1/portfolio/companies/{company_id}/filings/made-up_2026-01",
        headers=owner.headers,
        json={"filedOn": today.isoformat()},
    )
    assert unknown.status_code == 404
    again = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()["companies"][
        0
    ]
    status_of = {due["key"]: due for due in again["compliance"]}
    assert status_of[first["key"]]["status"] == "filed"
    assert status_of[first["key"]]["filedOn"] == today.isoformat()
    assert all(
        first["label"] + " for " + first["period"] not in item["text"]
        for item in again["attention"]
    )

    await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "analyst@example.com", "role": "group_analyst"},
    )
    analyst = await _join(client, mailbox, "analyst@example.com")
    seen = (await client.get("/v1/portfolio/summary", headers=analyst)).json()["companies"][0]
    assert seen["people"]["monthlyPayroll"] is None and seen["stock"]["stockValue"] is None
    assert seen["targets"]["collected"] is None and seen["targets"]["leads"] == "40.00"
    assert seen["health"]["status"] == "red"
    for url, body in (
        (f"/v1/portfolio/companies/{company_id}/compliance", {"gstFiling": "none"}),
        (f"/v1/portfolio/companies/{company_id}/targets", {"leads": "1"}),
    ):
        assert (await client.put(url, headers=analyst, json=body)).status_code == 403
    stranger = await signup(client, mailbox, "stranger@example.com")
    assert (
        await client.put(
            f"/v1/portfolio/companies/{company_id}/targets",
            headers=stranger.headers,
            json={"leads": "1"},
        )
    ).status_code == 404


async def test_books_profit_and_sales_between_own_companies(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    today = today_ist().isoformat()
    await _second_company(client, owner, "Pune Retail")
    await _lead_with_deal(client, owner.headers, "b-lead", "100", "new")

    async def invoice(key: str, company: str, rate_paise: int) -> str:
        created = await client.post(
            "/v1/finance/invoices",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "customer": "Accounts desk",
                "customer_company": company,
                "invoice_date": today,
                "due_date": today,
                "same_state": True,
                "lines": [
                    {
                        "item": "Cloth",
                        "hsn": "5208",
                        "qty": 1,
                        "rate_paise": rate_paise,
                        "gst_rate": 18,
                    }
                ],
            },
        )
        assert created.status_code == 201, created.text
        return str(created.json()["id"])

    to_group = await invoice("ic-1", "pune retail", 100000)
    await invoice("ext-1", "Kavita Stores", 50000)
    paid = await client.post(
        f"/v1/finance/invoices/{to_group}/payments",
        headers={**owner.headers, "Idempotency-Key": "ic-pay"},
        json={"amount_paise": 20000, "method": "UPI", "reference": "UPI-77", "paid_on": today},
    )
    assert paid.status_code == 201, paid.text
    bill = await client.post(
        "/v1/finance/bills",
        headers={**owner.headers, "Idempotency-Key": "ic-bill"},
        json={
            "vendor": "Pune Retail",
            "vendor_bill_no": "PR-1",
            "bill_date": today,
            "due_date": today,
            "amount_paise": 30000,
        },
    )
    assert bill.status_code == 201, bill.text

    companies = {
        item["name"]: item
        for item in (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
            "companies"
        ]
    }
    mumbai = companies["Mumbai Traders"]
    # Sales are before GST; costs are bills as recorded.
    assert mumbai["books"]["current"] == {
        "netSales": "1500.00",
        "costs": "300.00",
        "profitBeforePayroll": "1200.00",
        "moneyIn": "200.00",
        "moneyOut": "0.00",
        "salariesPosted": "0.00",
        "salariesMonths": [],
        "salariesComplete": False,
    }
    assert mumbai["books"]["previous"]["netSales"] == "0.00"
    # The name on the invoice and bill matches the other company, whatever its case.
    assert mumbai["intercompany"] == {
        "sales": "1000.00",
        "purchases": "300.00",
        "salesBefore": "0.00",
        "purchasesBefore": "0.00",
        "partners": ["Pune Retail"],
    }
    assert [(item["name"], item["current"]) for item in mumbai["customers"]] == [
        ("pune retail", "1000.00"),
        ("Kavita Stores", "500.00"),
    ]
    assert sum(item["current"] for item in mumbai["leadSources"]) == 1
    assert companies["Pune Retail"]["intercompany"]["sales"] == "0.00"


def test_llp_professional_tax_and_annual_gst_dues() -> None:
    llp = Profile("monthly", False, False, False, llp=True, pt_state="KA")
    found = {due.key: due.due_on for due in dues(llp, date(2026, 1, 1), date(2026, 12, 31))}
    assert found["llp11_2025"] == date(2026, 5, 30) and found["llp8_2025"] == date(2026, 10, 30)
    assert found["ptka_2026-10"] == date(2026, 11, 20)
    assert found["gstr9_2025"] == date(2026, 12, 31)
    assert "aoc4_2025" not in found
    mh = Profile("none", False, False, False, pt_state="MH")
    found = {due.key: due.due_on for due in dues(mh, date(2026, 1, 1), date(2026, 12, 31))}
    assert found["ptmh_2026-02"] == date(2026, 2, 28) and "gstr9_2025" not in found


async def test_registration_details_gaps_and_acknowledgement(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company_id = str(owner.tenant_id)
    url = f"/v1/portfolio/companies/{company_id}"

    async def company() -> httpx.Response:
        return await client.get("/v1/portfolio/summary", headers=owner.headers)

    plan = await client.put(
        f"{url}/compliance", headers=owner.headers, json={"gstFiling": "monthly", "tds": True}
    )
    assert plan.status_code == 200, plan.text
    first = (await company()).json()["companies"][0]
    assert first["registration"] is None
    gaps = [gap["text"] for gap in first["complianceGaps"]]
    assert any(text.startswith("No registration details") for text in gaps)
    assert any(text.startswith("TAN") for text in gaps)
    assert any(text.startswith("GSTIN") for text in gaps)

    bad = await client.put(f"{url}/registration", headers=owner.headers, json={"pan": "12345"})
    assert bad.status_code == 422
    saved = await client.put(
        f"{url}/registration",
        headers=owner.headers,
        json={
            "entityType": "pvt_ltd",
            "pan": "aapfu0939f",
            "tan": "BLRA12345B",
            "cin": "U51909KA2020PTC123456",
            "ptState": "ka",
            "directors": [{"name": "Vikram Malhotra", "din": "01234567"}],
            "registeredAddress": "  ",
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["pan"] == "AAPFU0939F" and saved.json()["registeredAddress"] is None
    after = (await company()).json()["companies"][0]
    assert after["registration"]["ptState"] == "KA"
    texts: dict[str, list[str]] = {}
    for gap in after["complianceGaps"]:
        texts.setdefault(gap["kind"], [])
        texts[gap["kind"]].append(gap["text"])
    assert not any(text.startswith("TAN") for text in texts.get("missing", []))
    assert any("Switch on company filings" in text for text in texts.get("suggestion", []))
    # Karnataka professional tax now shows in the calendar.
    keys = [due["key"] for due in after["compliance"]]
    assert any(key.startswith("ptka_") for key in keys)

    past = next(due for due in after["compliance"] if due["status"] == "overdue")
    marked = await client.put(
        f"{url}/filings/{past['key']}",
        headers=owner.headers,
        json={"filedOn": today_ist().isoformat(), "acknowledgement": " AA2910260012345 "},
    )
    assert marked.status_code == 204, marked.text
    filed = (await company()).json()["companies"][0]
    entry = next(due for due in filed["compliance"] if due["key"] == past["key"])
    assert entry["status"] == "filed" and entry["acknowledgement"] == "AA2910260012345"


async def test_activity_across_companies_leaves_money_out_for_an_analyst(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    await _second_company(client, owner, "Pune Retail")
    await _lead_with_deal(client, owner.headers, "act-1", "100", "new")
    today = today_ist().isoformat()
    invoice = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "act-inv"},
        json={
            "customer": "Kavita Rao",
            "invoice_date": today,
            "due_date": today,
            "same_state": True,
            "lines": [{"item": "Tea", "hsn": "0902", "qty": 1, "rate_paise": 1000, "gst_rate": 0}],
        },
    )
    assert invoice.status_code == 201, invoice.text

    seen = (await client.get("/v1/portfolio/activity", headers=owner.headers)).json()
    texts = {(item["company"], item["area"], item["text"]) for item in seen["items"]}
    assert ("Mumbai Traders", "Finance", "raised an invoice") in texts
    assert ("Mumbai Traders", "Sales", "opened a deal") in texts
    assert ("Pune Retail", "Portfolio", "added this company") in texts
    assert all(item["who"] == "Owner" for item in seen["items"])
    # Reading the Portfolio is not itself something that happened in a company.
    assert all("read" not in item["text"] for item in seen["items"])
    raised = next(item for item in seen["items"] if item["text"] == "raised an invoice")
    assert raised["amount"] == "₹10" and raised["detail"].endswith(" · Kavita Rao")
    assert raised["count"] == 1 and raised["flag"] is None
    # Two more invoices soon after read as one line, with the total.
    for key in ("act-inv-2", "act-inv-3"):
        more = await client.post(
            "/v1/finance/invoices",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "customer": "Kavita Rao",
                "invoice_date": today,
                "due_date": today,
                "same_state": True,
                "lines": [
                    {"item": "Tea", "hsn": "0902", "qty": 1, "rate_paise": 1000, "gst_rate": 0}
                ],
            },
        )
        assert more.status_code == 201, more.text
    seen = (await client.get("/v1/portfolio/activity", headers=owner.headers)).json()
    burst = [item for item in seen["items"] if "invoice" in item["text"]]
    assert [(b["text"], b["count"], b["amount"], b["detail"]) for b in burst] == [
        ("raised 3 invoices", 3, "₹30", None)
    ]

    shared = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={
            "email": "analyst@example.com",
            "role": "group_analyst",
            "companies": [str(owner.tenant_id)],
        },
    )
    assert shared.status_code == 200, shared.text
    analyst = await _join(client, mailbox, "analyst@example.com")
    view = (await client.get("/v1/portfolio/activity", headers=analyst)).json()
    areas = {item["area"] for item in view["items"]}
    assert "Sales" in areas and "Finance" not in areas
    assert {item["company"] for item in view["items"]} == {"Mumbai Traders"}
    assert all(item["amount"] is None and item["detail"] is None for item in view["items"])


def test_month_spans_end_today_and_cross_the_year() -> None:
    from janus_api.portfolio.trends import month_spans

    spans = month_spans(date(2026, 2, 10), 3)
    assert spans == [
        (date(2025, 12, 1), date(2025, 12, 31)),
        (date(2026, 1, 1), date(2026, 1, 31)),
        (date(2026, 2, 1), date(2026, 2, 10)),
    ]


async def test_trends_by_month_with_money_only_for_money_roles(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    await _lead_with_deal(client, owner.headers, "t-1", "2500", "won")
    today = today_ist().isoformat()
    created = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "t-inv"},
        json={
            "customer": "Kavita Rao",
            "invoice_date": today,
            "due_date": today,
            "same_state": True,
            "lines": [{"item": "Tea", "hsn": "0902", "qty": 2, "rate_paise": 50000, "gst_rate": 5}],
        },
    )
    assert created.status_code == 201, created.text
    trend = (await client.get("/v1/portfolio/trends?months=3", headers=owner.headers)).json()
    assert len(trend["months"]) == 3 and trend["months"][-1] == today[:7]
    [company] = trend["companies"]
    now = company["points"][-1]
    assert now["leads"] == 1 and now["wonDeals"] == 1 and now["wonValue"] == "2500.00"
    assert now["netSales"] == "1000.00" and now["collected"] == "0.00"
    assert company["points"][0]["leads"] == 0

    shared = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={
            "email": "trend@example.com",
            "role": "group_analyst",
            "companies": [str(owner.tenant_id)],
        },
    )
    assert shared.status_code == 200, shared.text
    analyst = await _join(client, mailbox, "trend@example.com")
    view = (await client.get("/v1/portfolio/trends", headers=analyst)).json()
    point = view["companies"][0]["points"][-1]
    assert point["leads"] == 1 and point["netSales"] is None and point["collected"] is None


async def test_company_details_people_roles_and_contact(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    url = f"/v1/portfolio/companies/{owner.tenant_id}"
    renamed = await client.put(
        f"{url}/details",
        headers=owner.headers,
        json={"name": "  Mumbai Traders Pvt Ltd ", "industry": "Trading", "companySize": "11–50"},
    )
    assert renamed.status_code == 200, renamed.text
    saved = await client.put(
        f"{url}/registration",
        headers=owner.headers,
        json={
            "entityType": "pvt_ltd",
            "website": "https://mumbaitraders.in",
            "email": "hello@mumbaitraders.in",
            "phone": "+91 22 4000 1234",
            "city": "Mumbai",
            "state": "Maharashtra",
            "directors": [
                {"name": "Asha Rao", "roles": ["founder", "director"], "title": "CEO"},
                {"name": "Ravi Iyer", "roles": ["cofounder"]},
                {"name": "Old Record", "din": "01234567"},
            ],
        },
    )
    assert saved.status_code == 200, saved.text
    bad = await client.put(f"{url}/registration", headers=owner.headers, json={"email": "nope"})
    assert bad.status_code == 422
    company = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
        "companies"
    ][0]
    assert company["name"] == "Mumbai Traders Pvt Ltd" and company["industry"] == "Trading"
    assert company["companySize"] == "11–50"
    reg = company["registration"]
    assert reg["city"] == "Mumbai" and reg["email"] == "hello@mumbaitraders.in"
    people = {person["name"]: person for person in reg["directors"]}
    assert people["Asha Rao"]["roles"] == ["founder", "director"]
    assert people["Asha Rao"]["title"] == "CEO"
    # A person saved without roles is a director, as everyone was before roles existed.
    assert people["Old Record"]["roles"] == ["director"]
    assert not any(gap["text"].startswith("Directors") for gap in company["complianceGaps"])

    shared = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={
            "email": "cfo@example.com",
            "role": "group_finance",
            "companies": [str(owner.tenant_id)],
        },
    )
    assert shared.status_code == 200, shared.text
    cfo = await _join(client, mailbox, "cfo@example.com")
    refused = await client.put(f"{url}/details", headers=cfo, json={"name": "Taken Over"})
    assert refused.status_code == 403


async def test_a_company_with_no_filings_set_up_is_not_up_to_date(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    await _lead_with_deal(client, owner.headers, "ns-1", "100", "new")

    async def company() -> dict[str, Any]:
        response = await client.get("/v1/portfolio/summary", headers=owner.headers)
        result: dict[str, Any] = response.json()["companies"][0]
        return result

    first = await company()
    assert first["complianceSetUp"] is False
    line = next(item for item in first["attention"] if item["text"].startswith("Compliance not"))
    assert line["severity"] == "medium" and line["to"] == "/portfolio?view=compliance"
    assert first["health"]["status"] == "amber"

    plan = await client.put(
        f"/v1/portfolio/companies/{owner.tenant_id}/compliance",
        headers=owner.headers,
        json={"gstFiling": "quarterly", "gstin": "27AAPFU0939F1ZV"},
    )
    assert plan.status_code == 200, plan.text
    after = await company()
    assert after["complianceSetUp"] is True
    assert not any(item["text"].startswith("Compliance not") for item in after["attention"])


def test_a_loss_reads_minus_rupees() -> None:
    assert inr("-300000") == "−₹3L" and inr("-1250") == "−₹1,250" and inr("-0.2") == "₹0"


async def test_late_supplier_bills_are_told_apart_from_bills_due_soon(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    today = today_ist()
    for key, issued, due, paise in (("late", -10, -2, 70000), ("soon", -1, 3, 30000)):
        bill = await client.post(
            "/v1/finance/bills",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "vendor": "Packaging Co",
                "vendor_bill_no": key,
                "bill_date": (today + timedelta(days=issued)).isoformat(),
                "due_date": (today + timedelta(days=due)).isoformat(),
                "amount_paise": paise,
            },
        )
        assert bill.status_code == 201, bill.text
    company = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
        "companies"
    ][0]
    assert company["money"]["payableLate"] == "700.00"
    assert company["money"]["payableDueThisWeek"] == "1000.00"
    line = next(item for item in company["attention"] if "supplier bills" in item["text"])
    assert line["text"] == "₹700 of supplier bills already late, ₹300 more due within 7 days"
    assert line["severity"] == "high"


def test_week_and_day_spans_end_today() -> None:
    from janus_api.portfolio.trends import spans_for

    weeks = spans_for("week", date(2026, 11, 7), 2)
    assert weeks == [
        (date(2026, 10, 26), date(2026, 11, 1)),
        (date(2026, 11, 2), date(2026, 11, 7)),
    ]
    days = spans_for("day", date(2026, 11, 7), 3)
    assert [start for start, _ in days] == [date(2026, 11, 5), date(2026, 11, 6), date(2026, 11, 7)]


async def test_trends_by_day(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await signup(client, mailbox)
    await _lead_with_deal(client, owner.headers, "d-1", "700", "won")
    today = today_ist().isoformat()
    created = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "d-inv"},
        json={
            "customer": "Kavita Rao",
            "invoice_date": today,
            "due_date": today,
            "same_state": True,
            "lines": [{"item": "Tea", "hsn": "0902", "qty": 1, "rate_paise": 25000, "gst_rate": 5}],
        },
    )
    assert created.status_code == 201, created.text
    trend = (await client.get("/v1/portfolio/trends?unit=day", headers=owner.headers)).json()
    assert trend["unit"] == "day" and len(trend["months"]) == 30
    assert trend["months"][-1] == today
    point = trend["companies"][0]["points"][-1]
    assert point["leads"] == 1 and point["wonValue"] == "700.00" and point["netSales"] == "250.00"
    assert all(p["leads"] == 0 for p in trend["companies"][0]["points"][:-1])


async def test_each_person_keeps_read_snoozed_and_red_thresholds_on_the_server(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    today = today_ist()
    created = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "late-45"},
        json={
            "customer": "Kavita Rao",
            "invoice_date": (today - timedelta(days=70)).isoformat(),
            "due_date": (today - timedelta(days=45)).isoformat(),
            "same_state": True,
            "lines": [
                {"item": "Staples", "hsn": "1904", "qty": 1, "rate_paise": 100000, "gst_rate": 0}
            ],
        },
    )
    assert created.status_code == 201, created.text

    async def overdue_line() -> dict[str, Any] | None:
        company = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
            "companies"
        ][0]
        lines = [item for item in company["attention"] if "overdue from customers" in item["text"]]
        return lines[0] if lines else None

    assert (await client.get("/v1/portfolio/preferences", headers=owner.headers)).json() == {
        "read": [],
        "snoozed": {},
        "thresholds": {
            "overdueRedAfterDays": 60,
            "overdueMinimum": 0,
            "approvalsRedAbove": 5,
            "lateBillsRedShare": 50,
        },
    }
    # 45 days late is under the default 60: watch, not red.
    line = await overdue_line()
    assert line and line["severity"] == "medium" and "days" not in line["text"]

    async def save(**thresholds: int) -> httpx.Response:
        return await client.put(
            "/v1/portfolio/preferences",
            headers=owner.headers,
            json={
                "read": ["1:0:Something"],
                "snoozed": {"inbox:1": 1893456000000},
                "thresholds": thresholds,
            },
        )

    assert (await save(overdueRedAfterDays=90)).status_code == 422  # ageing has no 90-day bucket
    saved = await save(overdueRedAfterDays=30)
    assert saved.status_code == 200, saved.text
    assert saved.json()["read"] == ["1:0:Something"]
    assert saved.json()["snoozed"] == {"inbox:1": 1893456000000}
    line = await overdue_line()
    assert line and line["severity"] == "high" and line["text"].endswith("₹1,000 over 30 days")
    assert (await save(overdueMinimum=5000)).status_code == 200
    assert await overdue_line() is None

    # Another person's settings are their own.
    other = await signup(client, mailbox, "second@example.com")
    theirs = (await client.get("/v1/portfolio/preferences", headers=other.headers)).json()
    assert theirs["read"] == [] and theirs["thresholds"]["overdueMinimum"] == 0


def test_late_fees_by_kind_of_filing() -> None:
    from janus_api.portfolio.compliance.due_dates import late_cost, register_start

    today = date(2026, 11, 10)
    # GSTR-3B: ₹50 a day, capped at ₹10,000.
    assert late_cost("gstr3b_2026-09", date(2026, 10, 20), today)[0] == 1050
    assert late_cost("gstr3b_2025-09", date(2025, 10, 20), today)[0] == 10000
    # MCA forms: ₹100 a day, no cap; DIR-3 KYC: a flat ₹5,000.
    assert late_cost("aoc4_2025", date(2026, 10, 30), today)[0] == 1100
    assert late_cost("dir3_2025", date(2026, 9, 30), today)[0] == 5000
    # Interest on an amount Janus does not keep: no figure, only what it is.
    fee, note = late_cost("tds_2026-09", date(2026, 10, 7), today)
    assert fee is None and "1.5% a month" in note
    assert late_cost("gstr3b_2026-10", date(2026, 11, 20), today) == (None, "")
    assert register_start(today) == date(2025, 4, 1)


async def test_gst_payable_unfiled_count_and_filing_register(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company_id = str(owner.tenant_id)
    plan = await client.put(
        f"/v1/portfolio/companies/{company_id}/compliance",
        headers=owner.headers,
        json={"gstin": "27AAPFU0939F1ZV", "gstFiling": "monthly"},
    )
    assert plan.status_code == 200, plan.text
    today = today_ist()
    invoice = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "gst-1"},
        json={
            "customer": "Kavita Rao",
            "invoice_date": today.isoformat(),
            "due_date": today.isoformat(),
            "same_state": True,
            "lines": [
                {"item": "Cloth", "hsn": "5208", "qty": 1, "rate_paise": 100000, "gst_rate": 5}
            ],
        },
    )
    assert invoice.status_code == 201, invoice.text
    for key, gst in (("bill-gst", 1800), ("bill-none", 0)):
        bill = await client.post(
            "/v1/finance/bills",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "vendor": "Yarn Co",
                "vendor_bill_no": key,
                "bill_date": today.isoformat(),
                "due_date": today.isoformat(),
                "amount_paise": 11800,
                "gst_paise": gst,
            },
        )
        assert bill.status_code == 201, bill.text

    company = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
        "companies"
    ][0]
    gst = company["gst"]
    assert gst["gstin"] == "27AAPFU0939F1ZV"
    assert gst["thisMonth"] == {
        "month": f"{today:%Y-%m}",
        "label": f"{today:%b %Y}",
        "output": "50.00",
        "creditNotes": "0.00",
        "input": "18.00",
        "blocked": "0.00",
        "carriedIn": "0.00",
        "payable": "32.00",
        "billsWithoutGst": 1,
    }
    assert gst["lastMonth"]["payable"] == "0.00"
    # Every unfiled return since 1 April last year, not only those in the 90-day list.
    listed = [due for due in company["compliance"] if due["status"] == "overdue"]
    assert company["unfiledCount"] > len(listed) > 0
    assert company["unfiledSince"].endswith("-04-01")
    late = listed[0]
    assert late["lateFee"] and int(late["lateFee"]) > 0 and "₹50 a day" in late["lateNote"]

    register = await client.get("/v1/portfolio/compliance/register", headers=owner.headers)
    assert register.status_code == 200, register.text
    rows = register.json()
    assert sum(row["status"] == "overdue" for row in rows) == company["unfiledCount"]
    assert {row["company"] for row in rows} == {"Mumbai Traders"}
    # Every filing the register lists can be recorded as filed, the oldest too.
    oldest = min((row for row in rows if row["status"] == "overdue"), key=lambda row: row["dueOn"])
    marked = await client.put(
        f"/v1/portfolio/companies/{company_id}/filings/{oldest['key']}",
        headers=owner.headers,
        json={"filedOn": oldest["dueOn"]},
    )
    assert marked.status_code == 204, marked.text


async def test_gst_to_pay_counts_credit_notes_carried_credit_and_blocked_credit(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "approver@example.com", role="owner")
    )
    await client.put(
        f"/v1/portfolio/companies/{owner.tenant_id}/compliance",
        headers=owner.headers,
        json={"gstin": "27AAPFU0939F1ZV", "gstFiling": "monthly"},
    )
    today = today_ist()
    last_month = (today.replace(day=1) - timedelta(days=1)).replace(day=5)

    async def invoice(key: str, day: date, rate_paise: int) -> dict[str, Any]:
        made = await client.post(
            "/v1/finance/invoices",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "customer": "Kavita Stores",
                "invoice_date": day.isoformat(),
                "due_date": day.isoformat(),
                "same_state": True,
                "lines": [
                    {
                        "item": "Cloth",
                        "hsn": "5208",
                        "qty": 1,
                        "rate_paise": rate_paise,
                        "gst_rate": 5,
                    }
                ],
            },
        )
        assert made.status_code == 201, made.text
        return dict(made.json())

    async def bill(key: str, day: date, gst_paise: int, blocked: bool = False) -> dict[str, Any]:
        made = await client.post(
            "/v1/finance/bills",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "vendor": "Yarn Co",
                "vendor_bill_no": key,
                "bill_date": day.isoformat(),
                "due_date": day.isoformat(),
                "amount_paise": gst_paise * 10,
                "gst_paise": gst_paise,
                "itc_blocked": blocked,
            },
        )
        assert made.status_code == 201, made.text
        return dict(made.json())

    # Last month: ₹50 charged, ₹90 of credit, so ₹40 of credit is carried into this month.
    await invoice("last-inv", last_month, 100000)
    await bill("last-bill", last_month, 9000)
    # This month: ₹100 charged, half the invoice credited back (₹50 of its GST), ₹30 of credit,
    # and ₹20 of GST on a staff lunch, which is blocked credit.
    sold = await invoice("this-inv", today, 200000)
    await bill("this-bill", today, 3000)
    lunch = await bill("lunch", today, 2000, blocked=True)
    assert lunch["itc_blocked"] is True
    note = await client.post(
        f"/v1/finance/invoices/{sold['id']}/credit-notes",
        headers={**owner.headers, "Idempotency-Key": "cn-gst"},
        json={
            "amount_paise": sold["total_paise"] // 2,
            "kind": "credit",
            "reason": "Half returned",
            "noted_on": today.isoformat(),
        },
    )
    assert note.status_code == 201, note.text
    note_id = note.json()["credit_notes"][0]["id"]

    async def gst() -> dict[str, Any]:
        found = await client.get("/v1/portfolio/summary", headers=owner.headers)
        return dict(found.json()["companies"][0]["gst"])

    # A pending credit note gives nothing back yet.
    assert (await gst())["thisMonth"]["creditNotes"] == "0.00"
    approved = await client.post(f"/v1/finance/credit-notes/{note_id}/approve", headers=second)
    assert approved.status_code == 200, approved.text
    position = await gst()
    assert position["lastMonth"]["payable"] == "-40.00"
    assert {
        k: position["thisMonth"][k]
        for k in ("output", "creditNotes", "input", "blocked", "carriedIn", "payable")
    } == {
        "output": "100.00",
        "creditNotes": "50.00",
        "input": "30.00",
        "blocked": "20.00",
        "carriedIn": "40.00",
        "payable": "-20.00",
    }
    # Unblocking the lunch would take its credit too; it is marked again as it was.
    url = f"/v1/finance/bills/{lunch['id']}/blocked-credit"
    freed = await client.put(url, headers=owner.headers, json={"blocked": False})
    assert freed.status_code == 200 and freed.json()["itc_blocked"] is False
    assert (await gst())["thisMonth"]["payable"] == "-40.00"
    assert (await client.put(url, headers=owner.headers, json={"blocked": True})).status_code == 200
    assert (await gst())["thisMonth"]["blocked"] == "20.00"


async def test_the_worker_emails_once_when_a_company_turns_red(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    from janus_api.portfolio.alerts import run_once as alert_once

    owner = await signup(client, mailbox)
    assert (await client.get("/v1/portfolio/alerts", headers=owner.headers)).json() == {
        "enabled": False
    }
    on = await client.put("/v1/portfolio/alerts", headers=owner.headers, json={"enabled": True})
    assert on.status_code == 200 and on.json() == {"enabled": True}
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])

    async def check() -> list[str]:
        async with admin_engine.begin() as connection:
            await connection.execute(
                text("UPDATE portfolio_alerts SET next_check_at = now() - interval '1 minute'")
            )
        before = len(mailbox.messages)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        assert await alert_once(factory)
        assert not await alert_once(factory)
        return [subject for _, subject, _ in mailbox.messages[before:]]

    try:
        # The first check only takes note of what is red now.
        assert await check() == []
        today = today_ist()
        created = await client.post(
            "/v1/finance/invoices",
            headers={**owner.headers, "Idempotency-Key": "red-1"},
            json={
                "customer": "Kavita Rao",
                "invoice_date": (today - timedelta(days=100)).isoformat(),
                "due_date": (today - timedelta(days=70)).isoformat(),
                "same_state": True,
                "lines": [
                    {"item": "Tea", "hsn": "0902", "qty": 1, "rate_paise": 100000, "gst_rate": 0}
                ],
            },
        )
        assert created.status_code == 201, created.text
        # Money owed over 60 days turns the company red: one email, then none while it stays red.
        assert await check() == ["Mumbai Traders turned red"]
        body = mailbox.messages[-1][2]
        assert "over 60 days" in body and "/portfolio?view=overview" in body
        assert await check() == []
    finally:
        await engine.dispose()


async def test_owners_get_the_weekly_email_and_red_alerts_unless_they_turn_them_off(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    from janus_api.portfolio.alerts import add_owner_defaults

    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    second = await signup(client, mailbox, "second-owner@example.com")
    off = await client.put("/v1/portfolio/digest", headers=second.headers, json={"enabled": False})
    assert off.status_code == 200
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        assert await add_owner_defaults(factory) >= 3
        # Run again, nothing more is added.
        assert await add_owner_defaults(factory) == 0
    finally:
        await engine.dispose()

    async def settings(headers: dict[str, str]) -> tuple[bool, bool]:
        digest = (await client.get("/v1/portfolio/digest", headers=headers)).json()
        alerts = (await client.get("/v1/portfolio/alerts", headers=headers)).json()
        return digest["enabled"], alerts["enabled"]

    assert await settings(owner.headers) == (True, True)
    # The other owner turned the email off before, so it stays off; alerts were never chosen.
    assert await settings(second.headers) == (False, True)
    # Not an owner: nothing is turned on for them.
    assert (await client.get("/v1/portfolio/alerts", headers=agent)).json() == {"enabled": False}


async def test_a_red_alert_also_reaches_the_owners_browser(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    admin_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from janus_api.core.config import get_settings
    from janus_api.portfolio.alerts import run_once as alert_once
    from tests.test_push import AUTH, FCM, P256DH, RFC_SERVER_PRIVATE

    owner = await signup(client, mailbox)
    monkeypatch.setattr(get_settings(), "vapid_private_key", SecretStr(RFC_SERVER_PRIVATE))
    saved = await client.post(
        "/v1/push/subscriptions",
        headers=owner.headers,
        json={"endpoint": FCM, "keys": {"p256dh": P256DH, "auth": AUTH}},
    )
    assert saved.status_code == 204, saved.text
    await client.put("/v1/portfolio/alerts", headers=owner.headers, json={"enabled": True})
    # A document with its scan, so the worker reads the register as the summary shows it.
    doc = await client.post(
        f"/v1/portfolio/companies/{owner.tenant_id}/documents",
        headers=owner.headers,
        json={"kind": "licence", "name": "Trade licence"},
    )
    scan = await client.put(
        f"/v1/portfolio/companies/{owner.tenant_id}/documents/{doc.json()['id']}/file",
        headers=owner.headers,
        files={"file": ("licence.pdf", b"%PDF-1.4 scan", "application/pdf")},
    )
    assert scan.status_code == 200, scan.text
    pushed: list[str] = []
    real_post = httpx.AsyncClient.post

    async def fake_post(self: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
        if not str(url).startswith(FCM):
            return await real_post(self, url, **kwargs)
        pushed.append(str(url))
        return httpx.Response(201)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def check() -> None:
        async with admin_engine.begin() as connection:
            await connection.execute(
                text("UPDATE portfolio_alerts SET next_check_at = now() - interval '1 minute'")
            )
        assert await alert_once(factory)

    try:
        await check()  # notes what is red now
        today = today_ist()
        created = await client.post(
            "/v1/finance/invoices",
            headers={**owner.headers, "Idempotency-Key": "red-push"},
            json={
                "customer": "Kavita Rao",
                "invoice_date": (today - timedelta(days=100)).isoformat(),
                "due_date": (today - timedelta(days=70)).isoformat(),
                "same_state": True,
                "lines": [
                    {"item": "Tea", "hsn": "0902", "qty": 1, "rate_paise": 100000, "gst_rate": 0}
                ],
            },
        )
        assert created.status_code == 201, created.text
        await check()
        assert mailbox.messages[-1][1] == "Mumbai Traders turned red"
        assert pushed == [FCM]
        async with admin_engine.begin() as connection:
            sent = (
                await connection.execute(
                    text(
                        "SELECT details FROM audit_log WHERE action = 'portfolio.alert_sent' "
                        "ORDER BY id DESC LIMIT 1"
                    )
                )
            ).scalar_one()
        assert sent["browsers"] == 1
    finally:
        await engine.dispose()


async def test_a_document_keeps_its_file_for_those_who_may_change_documents(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company = str(owner.tenant_id)
    made = await client.post(
        f"/v1/portfolio/companies/{company}/documents",
        headers=owner.headers,
        json={"kind": "licence", "name": "FSSAI licence", "number": "11519999000123"},
    )
    doc = made.json()
    assert doc["file"] is None
    url = f"/v1/portfolio/companies/{company}/documents/{doc['id']}/file"
    pdf = b"%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"
    attached = await client.put(
        url,
        headers=owner.headers,
        files={"file": ("C:\\scans\\fssai licence.PDF", pdf, "application/octet-stream")},
    )
    assert attached.status_code == 200, attached.text
    assert attached.json()["file"] == {
        "name": "fssai licence.pdf",
        "size": len(pdf),
        "contentType": "application/pdf",
    }
    got = await client.get(url, headers=owner.headers)
    assert got.status_code == 200 and got.content == pdf
    assert got.headers["content-type"] == "application/pdf"
    assert got.headers["x-content-type-options"] == "nosniff"

    # The type is told by the bytes: a program named .pdf is refused, and so is a large file.
    program = await client.put(
        url,
        headers=owner.headers,
        files={"file": ("licence.pdf", b"MZ\x90\x00" * 10, "application/pdf")},
    )
    assert program.status_code == 422 and program.json()["error"]["code"] == "invalid_file"
    large = await client.put(
        url,
        headers=owner.headers,
        files={"file": ("big.pdf", b"%PDF-" + b"0" * (5 * 1024 * 1024), "application/pdf")},
    )
    assert large.status_code == 413
    # A new scan replaces the old one.
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    replaced = await client.put(
        url, headers=owner.headers, files={"file": ("photo", png, "image/png")}
    )
    assert replaced.json()["file"]["name"] == "photo.png"
    assert (await client.get(url, headers=owner.headers)).content == png

    # A read-only analyst sees that there is a file, but cannot open it.
    shared = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "analyst@example.com", "role": "group_analyst", "companies": [company]},
    )
    assert shared.status_code in (200, 201), shared.text
    analyst = await _join(client, mailbox, "analyst@example.com")
    seen = (await client.get("/v1/portfolio/summary", headers=analyst)).json()
    assert seen["companies"][0]["documents"][0]["file"]["name"] == "photo.png"
    assert (await client.get(url, headers=analyst)).status_code == 403
    assert (await client.delete(url, headers=analyst)).status_code == 403

    assert (await client.delete(url, headers=owner.headers)).status_code == 204
    assert (await client.get(url, headers=owner.headers)).status_code == 404
    # Removing the document removes its file with it.
    await client.put(url, headers=owner.headers, files={"file": ("a.pdf", pdf, "application/pdf")})
    removed = await client.delete(
        f"/v1/portfolio/companies/{company}/documents/{doc['id']}", headers=owner.headers
    )
    assert removed.status_code == 204


async def test_documents_that_expire_need_the_owner(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company = str(owner.tenant_id)
    today = today_ist()
    url = f"/v1/portfolio/companies/{company}/documents"
    fssai = await client.post(
        url,
        headers=owner.headers,
        json={
            "kind": "licence",
            "name": "FSSAI licence",
            "number": "11519999000123",
            "expiresOn": (today + timedelta(days=12)).isoformat(),
        },
    )
    assert fssai.status_code == 201, fssai.text
    assert fssai.json()["status"] == "expiring" and fssai.json()["daysLeft"] == 12
    bad = await client.post(
        url,
        headers=owner.headers,
        json={
            "kind": "insurance",
            "name": "Fire policy",
            "issuedOn": today.isoformat(),
            "expiresOn": (today - timedelta(days=1)).isoformat(),
        },
    )
    assert bad.status_code == 422

    async def lines() -> list[tuple[str, str]]:
        found = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
            "companies"
        ][0]
        return [(a["severity"], a["text"]) for a in found["attention"] if "document" in a["text"]]

    assert await lines() == [
        ("medium", "1 document to renew within 30 days, first FSSAI licence in 12 days")
    ]
    policy = await client.post(
        url,
        headers=owner.headers,
        json={
            "kind": "insurance",
            "name": "Fire policy",
            "expiresOn": (today - timedelta(days=3)).isoformat(),
        },
    )
    assert policy.status_code == 201, policy.text
    assert ("high", "1 document expired: Fire policy") in await lines()
    renewed = await client.put(
        f"{url}/{policy.json()['id']}",
        headers=owner.headers,
        json={
            "kind": "insurance",
            "name": "Fire policy",
            "expiresOn": (today + timedelta(days=365)).isoformat(),
        },
    )
    assert renewed.status_code == 200 and renewed.json()["status"] == "valid"
    removed = await client.delete(f"{url}/{fssai.json()['id']}", headers=owner.headers)
    assert removed.status_code == 204
    assert await lines() == []
    stranger = await signup(client, mailbox, "stranger@example.com")
    denied = await client.post(
        url, headers=stranger.headers, json={"kind": "other", "name": "Lease"}
    )
    assert denied.status_code == 404


async def test_an_invoice_between_own_companies_gets_its_bill_in_one_step(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    retail = await _second_company(client, owner, "Pune Retail")
    today = today_ist().isoformat()
    invoice = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "ic-1"},
        json={
            "customer": "Accounts",
            "customer_company": "Pune Retail",
            "invoice_date": today,
            "due_date": today,
            "same_state": True,
            "lines": [
                {"item": "Cloth", "hsn": "5208", "qty": 1, "rate_paise": 1000000, "gst_rate": 5}
            ],
        },
    )
    assert invoice.status_code == 201, invoice.text
    number = invoice.json()["number"]

    links = (await client.get("/v1/portfolio/intercompany", headers=owner.headers)).json()
    assert [(link["seller"], link["buyer"], link["invoice"], link["bill"]) for link in links] == [
        ("Mumbai Traders", "Pune Retail", number, None)
    ]
    assert links[0]["amount"] == "10500.00" and links[0]["gst"] == "500.00"
    body = {"sellerId": str(owner.tenant_id), "invoice": number}
    made = await client.post("/v1/portfolio/intercompany/bills", headers=owner.headers, json=body)
    assert made.status_code == 201, made.text
    bill = made.json()["bill"]
    assert bill.startswith("BILL-")
    again = await client.post("/v1/portfolio/intercompany/bills", headers=owner.headers, json=body)
    assert again.json()["bill"] == bill  # recorded once
    links = (await client.get("/v1/portfolio/intercompany", headers=owner.headers)).json()
    assert links[0]["bill"] == bill

    # Both sides now agree: the group's sales and costs between the companies match.
    companies = {
        item["name"]: item
        for item in (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
            "companies"
        ]
    }
    assert companies["Mumbai Traders"]["intercompany"]["sales"] == "10000.00"
    assert companies["Pune Retail"]["intercompany"]["purchases"] == "10000.00"
    assert companies["Pune Retail"]["gst"] is None  # GST not set up there

    missing = await client.post(
        "/v1/portfolio/intercompany/bills",
        headers=owner.headers,
        json={"sellerId": retail["id"], "invoice": number},
    )
    assert missing.status_code == 404


async def test_a_bill_recorded_by_hand_is_found_so_it_is_not_recorded_twice(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    retail = await _second_company(client, owner, "Pune Retail")
    today = today_ist()

    async def invoice(key: str, rate_paise: int) -> dict[str, Any]:
        made = await client.post(
            "/v1/finance/invoices",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "customer": "Accounts",
                # The buyer's name as the sales team typed it.
                "customer_company": "PUNE RETAIL PVT. LTD.",
                "invoice_date": today.isoformat(),
                "due_date": today.isoformat(),
                "same_state": True,
                "lines": [
                    {
                        "item": "Cloth",
                        "hsn": "5208",
                        "qty": 1,
                        "rate_paise": rate_paise,
                        "gst_rate": 5,
                    }
                ],
            },
        )
        assert made.status_code == 201, made.text
        return dict(made.json())

    by_number = await invoice("ic-a", 1000000)
    by_amount = await invoice("ic-b", 2000000)
    missing = await invoice("ic-c", 3000000)
    switched = await client.post(
        "/v1/me/switch-tenant", headers=owner.headers, json={"tenant_id": int(retail["id"])}
    )
    in_retail = _bearer(switched.json())

    async def hand_bill(key: str, number: str, amount_paise: int, days_later: int) -> str:
        made = await client.post(
            "/v1/finance/bills",
            headers={**in_retail, "Idempotency-Key": key},
            json={
                "vendor": "M/s Mumbai Traders Pvt Ltd",
                "vendor_bill_no": number,
                "bill_date": (today + timedelta(days=days_later)).isoformat(),
                "due_date": (today + timedelta(days=30)).isoformat(),
                "amount_paise": amount_paise,
            },
        )
        assert made.status_code == 201, made.text
        return str(made.json()["number"])

    # The first under its number written another way; the second under the supplier's challan
    # number, for the same amount three days later.
    first = await hand_bill("hand-a", by_number["number"].lower().replace("-", "/"), 1050000, 0)
    second = await hand_bill("hand-b", "DC-77", by_amount["total_paise"], 3)
    links = {
        link["invoice"]: link
        for link in (await client.get("/v1/portfolio/intercompany", headers=in_retail)).json()
    }
    assert set(links) == {by_number["number"], by_amount["number"], missing["number"]}
    assert (links[by_number["number"]]["bill"], links[by_number["number"]]["billProbable"]) == (
        first,
        False,
    )
    assert (links[by_amount["number"]]["bill"], links[by_amount["number"]]["billProbable"]) == (
        second,
        True,
    )
    assert links[missing["number"]]["bill"] is None
    for number in (by_number["number"], by_amount["number"]):
        twice = await client.post(
            "/v1/portfolio/intercompany/bills",
            headers=in_retail,
            json={"sellerId": str(owner.tenant_id), "invoice": number},
        )
        assert twice.status_code == 409 and twice.json()["error"]["code"] == "already_recorded"
    made = await client.post(
        "/v1/portfolio/intercompany/bills",
        headers=in_retail,
        json={"sellerId": str(owner.tenant_id), "invoice": missing["number"]},
    )
    assert made.status_code == 201 and made.json()["buyer"] == "Pune Retail"


async def test_last_months_salaries_are_posted_to_the_books_once(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    seeded = await client.post(
        "/v1/hr/records/seed",
        headers=owner.headers,
        json={
            "records": {
                "employee": [
                    {
                        "id": "emp-001",
                        "name": "Owner",
                        "email": "owner@example.com",
                        "title": "Staff",
                        "department": "Sales",
                        "managerId": None,
                        "status": "active",
                        "salaryMonthly": 50000,
                    }
                ]
            }
        },
    )
    assert seeded.status_code in (200, 201), seeded.text
    today = today_ist()
    last = (today.replace(day=1) - timedelta(days=1)).replace(day=1)

    async def company(period: str = "month") -> dict[str, Any]:
        found = await client.get(f"/v1/portfolio/summary?period={period}", headers=owner.headers)
        return found.json()["companies"][0]

    assert (await company())["payroll"] == {
        "month": f"{last:%Y-%m}",
        "label": f"{last:%b %Y}",
        "posted": None,
        "fromHr": "50000.00",
    }
    url = f"/v1/portfolio/companies/{owner.tenant_id}/payroll"
    posted = await client.post(url, headers=owner.headers, json={"month": f"{last:%Y-%m}"})
    assert posted.status_code == 201 and posted.json() == {"posted": True}
    again = await client.post(url, headers=owner.headers, json={"month": f"{last:%Y-%m}"})
    assert again.json() == {"posted": False}
    early = await client.post(url, headers=owner.headers, json={"month": f"{today:%Y-%m}"})
    assert early.status_code == 422
    assert (await company())["payroll"]["posted"] == "50000.00"
    if today.month != 4:  # the financial year to date holds last month
        books = (await company("fy"))["books"]["current"]
        assert books["salariesPosted"] == "50000.00"
        assert f"{last:%Y-%m}" in books["salariesMonths"]
        assert books["salariesComplete"] is False  # this month is not posted yet


async def test_a_bank_statement_gives_cash_and_how_long_it_lasts(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    url = f"/v1/portfolio/companies/{owner.tenant_id}/bank-statement"
    today = today_ist()

    def day(back: int) -> str:
        return (today - timedelta(days=back)).isoformat()

    rows = [
        {"date": day(120), "description": "Opening", "amount": "500000", "balance": "500000"},
        {"date": day(60), "description": "Rent", "amount": "-150000", "balance": "350000"},
        {"date": day(30), "description": "Salaries", "amount": "-150000", "balance": "200000"},
        {"date": day(5), "description": "Customer", "amount": "50000", "balance": "250000"},
    ]
    sent = await client.post(
        url, headers=owner.headers, json={"account": "HDFC 1234", "rows": rows}
    )
    assert sent.status_code == 201 and sent.json() == {"added": 4, "skipped": 0}
    again = await client.post(
        url, headers=owner.headers, json={"account": "HDFC 1234", "rows": rows}
    )
    assert again.json() == {"added": 0, "skipped": 4}

    company = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
        "companies"
    ][0]
    cash = company["cash"]
    assert cash["total"] == "250000.00" and cash["asOf"] == day(5)
    # Over the statement's last 90 days, 3 lakh went out and 0.5 lakh came in.
    assert cash["monthlyBurn"] == "83333.33" and cash["runwayMonths"] == 3.0

    spend = [
        {"date": day(3), "description": "Supplier", "amount": "-200000", "balance": "50000"},
    ]
    assert (
        await client.post(url, headers=owner.headers, json={"account": "HDFC 1234", "rows": spend})
    ).status_code == 201
    # Now 5 lakh out and 0.5 lakh in over 90 days, with 0.5 lakh left.
    cash = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()["companies"][
        0
    ]["cash"]
    assert cash["total"] == "50000.00" and cash["monthlyBurn"] == "150000.00"
    assert cash["runwayMonths"] == 0.3
    lines = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()["companies"][
        0
    ]["attention"]
    assert {
        "severity": "high",
        "text": "Cash in the bank lasts about 0.3 months at the last 90 days' spending",
        "to": f"/portfolio?view=finance&company={owner.tenant_id}",
    } in lines
    bad = await client.post(
        url,
        headers=owner.headers,
        json={"account": "X", "rows": [{"date": day(1), "amount": "12,000"}]},
    )
    assert bad.status_code == 422


async def test_months_imported_from_tally_fill_the_trends_before_janus(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    today = today_ist()
    this_month = today.replace(day=1)
    year_ago = date(this_month.year - 1, this_month.month, 1)
    last = (this_month - timedelta(days=1)).replace(day=1)
    url = f"/v1/portfolio/companies/{owner.tenant_id}/history"
    sent = await client.post(
        url,
        headers=owner.headers,
        json={
            "source": "tally",
            "months": [
                {"month": f"{year_ago:%Y-%m}", "sales": "250000", "costs": "180000"},
                {"month": f"{last:%Y-%m}", "sales": "90000.50", "costs": "1000"},
            ],
        },
    )
    assert sent.status_code == 201 and sent.json() == {"months": 2}
    early = await client.post(
        url,
        headers=owner.headers,
        json={"source": "zoho", "months": [{"month": f"{this_month:%Y-%m}", "sales": "1"}]},
    )
    assert early.status_code == 422
    # A month with Janus's own records keeps them; the import is only for months without.
    invoice = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "hist-1"},
        json={
            "customer": "Kavita Rao",
            "invoice_date": last.isoformat(),
            "due_date": last.isoformat(),
            "same_state": True,
            "lines": [{"item": "Tea", "hsn": "0902", "qty": 1, "rate_paise": 50000, "gst_rate": 0}],
        },
    )
    assert invoice.status_code == 201, invoice.text
    trends = (
        await client.get("/v1/portfolio/trends?unit=month&count=13", headers=owner.headers)
    ).json()
    points = {p["month"]: p for p in trends["companies"][0]["points"]}
    assert points[f"{year_ago:%Y-%m}"]["netSales"] == "250000.00"
    assert points[f"{year_ago:%Y-%m}"]["costs"] == "180000.00"
    assert points[f"{year_ago:%Y-%m}"]["imported"] is True
    assert points[f"{last:%Y-%m}"]["netSales"] == "500.00"
    assert points[f"{last:%Y-%m}"]["imported"] is False


async def test_six_portfolio_roles_and_who_may_give_them(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company = str(owner.tenant_id)
    shared = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "admin@example.com", "role": "group_admin", "companies": [company]},
    )
    assert shared.status_code == 200 and shared.json()["done"] == ["Mumbai Traders"]
    administrator = await _join(client, mailbox, "admin@example.com")
    # A Portfolio administrator sees money and shares the Portfolio, without owning the company.
    seen = (await client.get("/v1/portfolio/summary", headers=administrator)).json()
    assert seen["companies"][0]["money"] is not None
    analyst = await client.post(
        "/v1/portfolio/access",
        headers=administrator,
        json={"email": "analyst@example.com", "role": "group_analyst", "companies": [company]},
    )
    assert analyst.status_code == 200 and analyst.json()["done"] == ["Mumbai Traders"]
    # Nobody gives more than they hold: a Finance manager can approve and record bills, which the
    # administrator cannot, so only the Owner gives it.
    finance = await client.post(
        "/v1/portfolio/access",
        headers=administrator,
        json={"email": "cfo@example.com", "role": "finance_manager", "companies": [company]},
    )
    assert finance.json()["done"] == []
    assert "can do more than yours" in finance.json()["skipped"][0]["reason"]
    finance = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "cfo@example.com", "role": "finance_manager", "companies": [company]},
    )
    assert finance.json()["done"] == ["Mumbai Traders"]
    # Owner-level roles stay the Owner's to give.
    for role in ("owner", "group_admin"):
        refused = await client.post(
            "/v1/portfolio/access",
            headers=administrator,
            json={"email": f"{role}@example.com", "role": role, "companies": [company]},
        )
        assert refused.json()["done"] == []
        assert refused.json()["skipped"][0]["reason"] == "Only its Owner can give that role."
    cfo = await _join(client, mailbox, "cfo@example.com")
    assert (await client.get("/v1/portfolio/summary", headers=cfo)).json()["companies"][0][
        "money"
    ] is not None
    # Nobody gives more than they hold: the administrator manages members, but cannot invite a
    # Company administrator, who can do more.
    over = await client.post(
        "/v1/invitations",
        headers=administrator,
        json={"email": "boss@example.com", "role": "company_admin"},
    )
    assert over.status_code == 403
    operations = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "ops@example.com", "role": "operations_manager", "companies": [company]},
    )
    assert operations.json()["done"] == ["Mumbai Traders"]
    ops = await _join(client, mailbox, "ops@example.com")
    assert (await client.get("/v1/portfolio/summary", headers=ops)).json()["companies"][0][
        "money"
    ] is None
    # The administrator cannot remove another administrator; the Owner can.
    kept = await client.post(
        "/v1/portfolio/access/remove", headers=administrator, json={"email": "admin@example.com"}
    )
    assert kept.json()["done"] == []
    removed = await client.post(
        "/v1/portfolio/access/remove", headers=owner.headers, json={"email": "admin@example.com"}
    )
    assert removed.json()["done"] == ["Mumbai Traders"]


async def test_tds_deducted_on_bills_and_salaries_against_what_was_deposited(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company = str(owner.tenant_id)
    plan = await client.put(
        f"/v1/portfolio/companies/{company}/compliance",
        headers=owner.headers,
        json={"gstFiling": "none", "tds": True},
    )
    assert plan.status_code == 200, plan.text
    today = today_ist()
    last = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    bill = {
        "vendor": "Design Studio",
        "vendor_bill_no": "DS-1",
        "bill_date": last.isoformat(),
        "due_date": (last + timedelta(days=10)).isoformat(),
        "amount_paise": 11800000,
        "gst_paise": 1800000,
        "tds_paise": 1000000,
    }
    no_section = await client.post(
        "/v1/finance/bills", headers={**owner.headers, "Idempotency-Key": "tds-0"}, json=bill
    )
    assert no_section.status_code == 422
    made = await client.post(
        "/v1/finance/bills",
        headers={**owner.headers, "Idempotency-Key": "tds-1"},
        json={**bill, "tds_section": "194J"},
    )
    assert made.status_code == 201, made.text
    # The supplier is owed the bill less the TDS, which goes to the government.
    assert made.json()["due_paise"] == 10800000
    over = await client.post(
        f"/v1/finance/bills/{made.json()['id']}/payments",
        headers={**owner.headers, "Idempotency-Key": "tds-pay"},
        json={
            "amount_paise": 11800000,
            "method": "UPI",
            "reference": "UPI-9",
            "paid_on": today.isoformat(),
        },
    )
    assert over.status_code == 422
    seeded = await client.post(
        "/v1/hr/records/seed",
        headers=owner.headers,
        json={
            "records": {
                "employee": [
                    {
                        "id": "emp-1",
                        "name": "Owner",
                        "email": "owner@example.com",
                        "title": "Staff",
                        "department": "Sales",
                        "managerId": None,
                        "status": "active",
                        "salaryMonthly": 200000,
                    }
                ]
            }
        },
    )
    assert seeded.status_code in (200, 201), seeded.text
    posted = await client.post(
        f"/v1/portfolio/companies/{company}/payroll",
        headers=owner.headers,
        json={"month": f"{last:%Y-%m}"},
    )
    assert posted.status_code == 201, posted.text
    # TDS on salaries is worked out by the payroll run, not typed: ₹2 lakh a month is ₹24 lakh
    # for the year and ₹2,92,500 of tax with cess. Earlier months of the year had no run, so
    # their share counts as deducted, and the rest is spread over this and the months left.
    months_left = 12 - (last.month - 4) % 12
    salary_tds = (292500 - 292500 * (12 - months_left) // 12) // months_left

    async def tds() -> dict[str, Any]:
        found = await client.get("/v1/portfolio/summary", headers=owner.headers)
        return found.json()["companies"][0]["tds"]

    position = await tds()
    assert position["label"] == f"{last:%b %Y}"
    assert position["onBills"] == "10000.00" and position["onSalaries"] == f"{salary_tds}.00"
    assert position["bySection"] == {"194J": "10000.00"}
    deducted = 10000 + salary_tds
    assert position["deducted"] == f"{deducted}.00" and position["deposited"] is None
    assert position["toDeposit"] == f"{deducted}.00" and position["salariesPosted"] is True
    # The TDS payment recorded with a challan for part of it.
    challan = await client.put(
        f"/v1/portfolio/companies/{company}/filings/tds_{last:%Y-%m}",
        headers=owner.headers,
        json={"filedOn": today.isoformat(), "acknowledgement": "CIN-0001", "amount": "30000"},
    )
    assert challan.status_code == 204, challan.text
    position = await tds()
    assert position["deposited"] == "30000.00"
    assert position["toDeposit"] == f"{deducted - 30000}.00"


def test_customers_kept_new_and_lost() -> None:
    from janus_api.portfolio.customers import retention_for, spans

    assert spans(date(2026, 11, 10)) == (
        date(2024, 11, 1),
        date(2025, 10, 31),
        date(2025, 11, 1),
        date(2026, 10, 31),
    )
    before = (date(2024, 11, 1), date(2025, 10, 31))
    recent = (date(2025, 11, 1), date(2026, 10, 31))
    months = {
        "Kavita Stores": {date(2025, 3, 1): 50000, date(2026, 2, 1): 70000},
        "kavita stores ": {date(2026, 6, 1): 10000},  # the same customer, written differently
        "Metro Mart": {date(2025, 5, 1): 900000},
        "Sai Fashions": {date(2025, 9, 1): 20000},
        "Gupta Traders": {date(2026, 9, 1): 30000},
    }
    earlier, kept, new, lost = retention_for(months, before, recent)
    assert (earlier, kept, new) == (3, 1, 1)
    # Sales to one of the person's own companies are not a customer.
    assert retention_for(months, before, recent, frozenset({"gupta traders"}))[:3] == (3, 1, 0)
    assert [(item.name, item.salesBefore, item.lastBought) for item in lost] == [
        ("Metro Mart", "9000.00", "2025-05"),
        ("Sai Fashions", "200.00", "2025-09"),
    ]


def test_customer_names_match_without_punctuation_or_company_suffixes() -> None:
    from janus_api.portfolio.customers import customer_key, retention_for, similar_customers

    same = ["M/s Gupta Traders Pvt. Ltd.", "GUPTA TRADERS", "Gupta  Traders Private Limited"]
    assert {customer_key(name) for name in same} == {"gupta traders"}
    assert customer_key("Shah & Sons LLP") == customer_key("shah and sons")
    # A name that is only a suffix is kept as written.
    assert customer_key("Ltd") == "ltd"
    assert customer_key("Gupta Traders") != customer_key("Gupta Textiles")

    before = (date(2024, 11, 1), date(2025, 10, 31))
    recent = (date(2025, 11, 1), date(2026, 10, 31))
    months = {
        "M/s Gupta Traders Pvt. Ltd.": {date(2025, 3, 1): 90000},
        "GUPTA TRADERS": {date(2026, 3, 1): 10000},
        "Sai Fashions": {date(2025, 4, 1): 50000},
        "Sai Fashion": {date(2026, 4, 1): 5000},
        "Metro Mart": {date(2025, 5, 1): 20000},
    }
    # Gupta Traders is one customer, kept; the shown name is the spelling with the most sales.
    earlier, kept, new, lost = retention_for(months, before, recent)
    assert (earlier, kept, new) == (3, 1, 1)
    assert [item.name for item in lost] == ["Sai Fashions", "Metro Mart"]
    # The look-alike is offered, into the name with more sales.
    assert [(item.name, item.into) for item in similar_customers(months)] == [
        ("Sai Fashion", "Sai Fashions")
    ]
    # Once merged, it is one customer, kept, and no longer offered.
    aliases = {customer_key("Sai Fashion"): "Sai Fashions"}
    earlier, kept, new, lost = retention_for(months, before, recent, aliases=aliases)
    assert (earlier, kept, new) == (3, 2, 0) and [item.name for item in lost] == ["Metro Mart"]
    assert similar_customers(months, aliases=aliases) == []


async def test_an_owner_merges_two_spellings_of_one_customer_and_can_undo_it(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company = str(owner.tenant_id)
    last = (today_ist().replace(day=1) - timedelta(days=1)).replace(day=1)
    year_ago = date(last.year - 1, last.month, 1)
    await client.post(
        f"/v1/portfolio/companies/{company}/history/customers",
        headers=owner.headers,
        json={
            "source": "tally",
            "rows": [
                {"month": f"{year_ago:%Y-%m}", "customer": "Sai Fashions", "sales": "50000"},
                {"month": f"{last:%Y-%m}", "customer": "Sai Fashion", "sales": "5000"},
            ],
        },
    )

    async def mine() -> dict[str, Any]:
        found = await client.get("/v1/portfolio/customers", headers=owner.headers)
        return dict(found.json()["companies"][0])

    first = await mine()
    assert (first["before"], first["kept"], first["new"]) == (1, 0, 1)
    assert first["similar"] == [{"name": "Sai Fashion", "into": "Sai Fashions"}]
    url = f"/v1/portfolio/companies/{company}/customers/merges"
    made = await client.post(url, headers=owner.headers, json=first["similar"][0])
    assert made.status_code == 201, made.text
    merged = await mine()
    assert (merged["before"], merged["kept"], merged["new"], merged["rate"]) == (1, 1, 0, 100)
    assert merged["similar"] == [] and merged["lost"] == []
    assert merged["merges"] == [
        {"id": made.json()["id"], "name": "Sai Fashion", "into": "Sai Fashions"}
    ]
    again = await client.post(url, headers=owner.headers, json=first["similar"][0])
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_merged"
    same = await client.post(
        url, headers=owner.headers, json={"name": "SAI FASHIONS", "into": "Sai Fashions"}
    )
    assert same.status_code == 422
    undone = await client.delete(f"{url}/{made.json()['id']}", headers=owner.headers)
    assert undone.status_code == 204
    assert (await mine())["similar"] == first["similar"]
    assert (
        await client.delete(f"{url}/{made.json()['id']}", headers=owner.headers)
    ).status_code == 404


async def test_customer_retention_from_invoices_and_an_imported_report(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company = str(owner.tenant_id)
    today = today_ist()
    last = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    year_ago = date(last.year - 1, last.month, 1)
    invoice = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "ret-1"},
        json={
            "customer": "Accounts",
            "customer_company": "Kavita Stores",
            "invoice_date": last.isoformat(),
            "due_date": last.isoformat(),
            "same_state": True,
            "lines": [
                {"item": "Tea", "hsn": "0902", "qty": 1, "rate_paise": 100000, "gst_rate": 0}
            ],
        },
    )
    assert invoice.status_code == 201, invoice.text
    imported = await client.post(
        f"/v1/portfolio/companies/{company}/history/customers",
        headers=owner.headers,
        json={
            "source": "tally",
            "rows": [
                {"month": f"{year_ago:%Y-%m}", "customer": "KAVITA STORES", "sales": "5000"},
                {"month": f"{year_ago:%Y-%m}", "customer": "Metro Mart", "sales": "80000"},
                {"month": f"{year_ago:%Y-%m}", "customer": "Metro Mart", "sales": "20000"},
            ],
        },
    )
    assert imported.status_code == 201 and imported.json() == {"rows": 2}
    found = (await client.get("/v1/portfolio/customers", headers=owner.headers)).json()
    mine = found["companies"][0]
    assert (mine["before"], mine["kept"], mine["new"], mine["rate"]) == (2, 1, 0, 50)
    assert mine["lost"] == [
        {"name": "Metro Mart", "salesBefore": "100000.00", "lastBought": f"{year_ago:%Y-%m}"}
    ]
    assert mine["imported"] is True
    early = await client.post(
        f"/v1/portfolio/companies/{company}/history/customers",
        headers=owner.headers,
        json={
            "source": "zoho",
            "rows": [{"month": f"{today:%Y-%m}", "customer": "X", "sales": "1"}],
        },
    )
    assert early.status_code == 422


async def test_opening_balances_are_owed_and_paid_but_are_not_sales(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company = str(owner.tenant_id)
    today = today_ist()
    as_of = today - timedelta(days=40)
    body = {
        "asOf": as_of.isoformat(),
        "customers": [
            {
                "name": "Kavita Stores",
                "amount": "50000",
                "dueOn": (as_of + timedelta(days=5)).isoformat(),
            }
        ],
        "suppliers": [{"name": "Surat Yarn Co", "amount": "20000.50"}],
    }
    url = f"/v1/portfolio/companies/{company}/opening-balances"
    made = await client.post(url, headers=owner.headers, json=body)
    assert made.status_code == 201 and made.json() == {"invoices": 1, "bills": 1}
    again = await client.post(url, headers=owner.headers, json=body)
    assert again.json() == {"invoices": 0, "bills": 0}
    future = await client.post(
        url, headers=owner.headers, json={**body, "asOf": (today + timedelta(days=1)).isoformat()}
    )
    assert future.status_code == 422

    found = (await client.get("/v1/portfolio/summary?period=quarter", headers=owner.headers)).json()
    mine = found["companies"][0]
    assert mine["money"]["receivable"] == "50000.00" and mine["money"]["overdue"] == "50000.00"
    assert mine["money"]["payable"] == "20000.50"
    # Not a sale or a cost, and no customer figure.
    assert mine["books"]["current"]["netSales"] == "0.00"
    assert mine["books"]["current"]["costs"] == "0.00"
    assert mine["customers"] == []

    invoices = (await client.get("/v1/finance/invoices", headers=owner.headers)).json()
    opening = next(item for item in invoices if item["opening"])
    assert opening["number"].startswith("OB-")
    # The invoice series is not shifted by the opening balance.
    first = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "after-ob"},
        json={
            "customer": "Kavita Rao",
            "invoice_date": today.isoformat(),
            "due_date": today.isoformat(),
            "same_state": True,
            "lines": [{"item": "Tea", "hsn": "0902", "qty": 1, "rate_paise": 1000, "gst_rate": 0}],
        },
    )
    assert first.json()["number"] == f"INV-{today.year}-0101"
    paid = await client.post(
        f"/v1/finance/invoices/{opening['id']}/payments",
        headers={**owner.headers, "Idempotency-Key": "ob-pay"},
        json={
            "amount_paise": 5000000,
            "method": "UPI",
            "reference": "UPI-OB",
            "paid_on": today.isoformat(),
        },
    )
    assert paid.status_code == 201, paid.text
    found = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()
    assert found["companies"][0]["money"]["overdue"] == "0.00"


async def test_an_opening_balance_can_be_corrected_or_removed_until_it_is_settled(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    company = str(owner.tenant_id)
    as_of = today_ist() - timedelta(days=30)
    url = f"/v1/portfolio/companies/{company}/opening-balances"
    await client.post(
        url,
        headers=owner.headers,
        json={
            "asOf": as_of.isoformat(),
            "customers": [
                {"name": "Kavita Stores", "amount": "50000"},
                {"name": "Ravi Traders", "amount": "8000"},
            ],
            "suppliers": [{"name": "Surat Yarn Co", "amount": "20000"}],
        },
    )
    listed = (await client.get(url, headers=owner.headers)).json()
    assert [(row["kind"], row["name"], row["amount"]) for row in listed] == [
        ("customer", "Kavita Stores", "50000.00"),
        ("customer", "Ravi Traders", "8000.00"),
        ("supplier", "Surat Yarn Co", "20000.00"),
    ]
    kavita, ravi, surat = listed
    assert all(row["removable"] and row["settled"] == "0.00" for row in listed)

    # Kavita pays part, so her balance can be corrected but not below what she paid.
    invoice_id = kavita["id"].removeprefix("customer-")
    await client.post(
        f"/v1/finance/invoices/{invoice_id}/payments",
        headers={**owner.headers, "Idempotency-Key": "ob-part"},
        json={
            "amount_paise": 1000000,
            "method": "UPI",
            "reference": "UPI-1",
            "paid_on": today_ist().isoformat(),
        },
    )
    due = (as_of + timedelta(days=15)).isoformat()
    low = await client.patch(
        f"{url}/{kavita['id']}",
        headers=owner.headers,
        json={"name": "Kavita Stores", "amount": "9000", "dueOn": due},
    )
    assert low.status_code == 409 and low.json()["error"]["code"] == "opening_below_settled"
    changed = await client.patch(
        f"{url}/{kavita['id']}",
        headers=owner.headers,
        json={"name": "Kavita Stores Pvt Ltd", "amount": "45000", "dueOn": due},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["settled"] == "10000.00" and not changed.json()["removable"]
    summary = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()
    assert summary["companies"][0]["money"]["receivable"] == "43000.00"
    # Renaming onto another party's balance for that day is refused.
    clash = await client.patch(
        f"{url}/{ravi['id']}",
        headers=owner.headers,
        json={"name": "kavita stores pvt ltd", "amount": "8000", "dueOn": due},
    )
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "opening_exists"
    early = await client.patch(
        f"{url}/{ravi['id']}",
        headers=owner.headers,
        json={
            "name": "Ravi Traders",
            "amount": "8000",
            "dueOn": (as_of - timedelta(days=1)).isoformat(),
        },
    )
    assert early.status_code == 422

    # A paid balance stays in the books; an unpaid one recorded by mistake can go.
    kept = await client.delete(f"{url}/{kavita['id']}", headers=owner.headers)
    assert kept.status_code == 409 and kept.json()["error"]["code"] == "opening_in_use"
    gone = await client.delete(f"{url}/{surat['id']}", headers=owner.headers)
    assert gone.status_code == 204
    assert (await client.delete(f"{url}/{surat['id']}", headers=owner.headers)).status_code == 404
    summary = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()
    assert summary["companies"][0]["money"]["payable"] == "0.00"
    assert [row["name"] for row in (await client.get(url, headers=owner.headers)).json()] == [
        "Kavita Stores Pvt Ltd",
        "Ravi Traders",
    ]
    # Another company's balance cannot be reached through this one.
    other = await _second_company(client, owner, "Pune Retail")
    stray = await client.delete(
        f"/v1/portfolio/companies/{other['id']}/opening-balances/{ravi['id']}",
        headers=owner.headers,
    )
    assert stray.status_code == 404


async def test_one_link_accepts_every_company_a_portfolio_share_covered(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    retail = await _second_company(client, owner, "Pune Retail")
    shared = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "cfo@example.com", "role": "group_finance", "companies": []},
    )
    assert shared.json()["done"] == ["Mumbai Traders", "Pune Retail"]
    # The person follows only the last email's link.
    person = await _join(client, mailbox, "cfo@example.com")
    seen = (await client.get("/v1/portfolio/summary", headers=person)).json()
    assert {item["name"] for item in seen["companies"]} == {"Mumbai Traders", "Pune Retail"}
    # The other email's link now says the invitation was already accepted, not that it is invalid.
    links = [
        word
        for to, _, body in mailbox.messages
        if to == "cfo@example.com"
        for word in body.split()
        if "/invite?" in word
    ]
    assert len(links) == 2
    used = parse_qs(urlsplit(links[0]).query)["token"][0]
    again = await client.post(
        f"/v1/invitations/{used}/accept", json={"name": "Group CFO", "password": PASSWORD}
    )
    assert again.status_code == 409 and again.json()["error"]["code"] == "invitation_used"
    access = (await client.get("/v1/portfolio/access", headers=owner.headers)).json()
    cfo = next(item for item in access["people"] if item["email"] == "cfo@example.com")
    assert {item["status"] for item in cfo["companies"]} == {"active"}
    assert retail["name"] == "Pune Retail"


async def test_an_invitation_with_another_role_is_not_accepted_with_a_share(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    await _second_company(client, owner, "Pune Retail")
    for company, role in ((str(owner.tenant_id), "group_finance"), ("", "group_analyst")):
        sent = await client.post(
            "/v1/portfolio/access",
            headers=owner.headers,
            json={
                "email": "cfo@example.com",
                "role": role,
                "companies": [company] if company else [],
            },
        )
        assert sent.status_code == 200, sent.text
    # The analyst invitations went to both companies, but Mumbai already had a finance one, so
    # only Pune got one; following its link accepts nothing with a different role.
    person = await _join(client, mailbox, "cfo@example.com")
    seen = (await client.get("/v1/portfolio/summary", headers=person)).json()["companies"]
    assert [item["name"] for item in seen] == ["Pune Retail"]


async def test_the_kind_of_business_decides_the_export_payment_warning(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    url = f"/v1/portfolio/companies/{owner.tenant_id}"
    today = today_ist()
    shipped = today - timedelta(days=300)
    invoice = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "bm-inv"},
        json={
            "customer": "Al Noor Trading",
            "invoice_date": shipped.isoformat(),
            "due_date": (shipped + timedelta(days=60)).isoformat(),
            "same_state": False,
            "lines": [
                {"item": "Denim", "hsn": "5209", "qty": 1, "rate_paise": 500000, "gst_rate": 0}
            ],
        },
    )
    assert invoice.status_code == 201, invoice.text

    async def company() -> dict[str, Any]:
        body = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()
        return dict(body["companies"][0])

    before = await company()
    assert before["businessModel"] == ""
    assert before["money"]["unpaidOver9Months"] == "5000.00"
    assert before["money"]["unpaidOver9MonthsInvoices"] == 1
    # Not an exporter (yet): the invoice is only overdue, with no FEMA line.
    assert not any("9 months" in item["text"] for item in before["attention"])

    # Leaving businessModel out keeps it; naming it sets it.
    for body, expected in (
        ({"name": "Neema Exports", "industry": "Textiles"}, ""),
        ({"name": "Neema Exports", "businessModel": "import_export"}, "import_export"),
        ({"name": "Neema Exports", "industry": "Textiles"}, "import_export"),
    ):
        saved = await client.put(f"{url}/details", headers=owner.headers, json=body)
        assert saved.status_code == 200, saved.text
        assert (await company())["businessModel"] == expected
    after = await company()
    line = next(item for item in after["attention"] if "9 months" in item["text"])
    assert line["severity"] == "high" and "FEMA" in line["text"] and "₹5,000" in line["text"]

    refused = await client.put(
        f"{url}/details", headers=owner.headers, json={"name": "X Ltd", "businessModel": "casino"}
    )
    assert refused.status_code == 422
    added = await client.post(
        "/v1/portfolio/companies",
        headers=owner.headers,
        json={"name": "Neema Holdings", "businessModel": "holding"},
    )
    assert added.status_code == 201, added.text
    listed = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()
    assert {item["name"]: item["businessModel"] for item in listed["companies"]} == {
        "Neema Exports": "import_export",
        "Neema Holdings": "holding",
    }


async def test_the_biggest_customer_is_the_biggest_in_the_period(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    period = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()["period"]
    today, before = date.fromisoformat(period["end"]), date.fromisoformat(period["previousStart"])

    async def sell(customer: str, day: date, rupees: int, key: str) -> None:
        made = await client.post(
            "/v1/finance/invoices",
            headers={**owner.headers, "Idempotency-Key": key},
            json={
                "customer": "Accounts",
                "customer_company": customer,
                "invoice_date": day.isoformat(),
                "due_date": (day + timedelta(days=30)).isoformat(),
                "same_state": True,
                "lines": [
                    {
                        "item": "Denim",
                        "hsn": "5209",
                        "qty": 1,
                        "rate_paise": rupees * 100,
                        "gst_rate": 0,
                    }
                ],
            },
        )
        assert made.status_code == 201, made.text

    # Osaka bought more last month; Al Noor buys more now. Gone Ltd bought only before.
    await sell("Osaka Fabrics", before, 800000, "bc-1")
    await sell("Osaka Fabrics", today, 490000, "bc-2")
    await sell("Al Noor Trading", before, 100000, "bc-3")
    await sell("Al Noor Trading", today, 600000, "bc-4")
    await sell("Gone Ltd", before, 900000, "bc-5")
    company = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
        "companies"
    ][0]
    assert [item["name"] for item in company["customers"]] == [
        "Al Noor Trading",
        "Osaka Fabrics",
        "Gone Ltd",
    ]
    assert company["customers"][0]["current"] == "600000.00"
