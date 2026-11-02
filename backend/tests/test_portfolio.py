import os
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from janus_api.portfolio.compliance.due_dates import Profile, dues, status
from janus_api.portfolio.digest import day, inr, next_due
from janus_api.portfolio.digest import run_once as digest_once
from janus_api.portfolio.periods import period_for, today_ist
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
    assert any("past the end date" in text for text in texts)
    assert any("urgent" in text for text in texts)
    assert company["attention"][0]["severity"] == "high"
    assert "1 approval waiting: 1 leave request" in texts
    # Every overdue filing is one line, not one line each.
    filing_lines = [text for text in texts if "overdue, the oldest" in text]
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
    }
    assert mumbai["books"]["previous"]["netSales"] == "0.00"
    # The name on the invoice and bill matches the other company, whatever its case.
    assert mumbai["intercompany"] == {
        "sales": "1000.00",
        "purchases": "300.00",
        "partners": ["Pune Retail"],
    }
    assert [(item["name"], item["current"]) for item in mumbai["customers"]] == [
        ("pune retail", "1000.00"),
        ("Kavita Stores", "500.00"),
    ]
    assert sum(item["current"] for item in mumbai["leadSources"]) == 1
    assert companies["Pune Retail"]["intercompany"]["sales"] == "0.00"
