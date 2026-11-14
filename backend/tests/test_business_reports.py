import os
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from janus_api.business.report_mail import next_due
from janus_api.business.report_mail import run_once as report_once
from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


async def _user_id(client: httpx.AsyncClient, headers: dict[str, str], address: str) -> int:
    members = (await client.get("/v1/members", headers=headers)).json()
    return int(next(item["user_id"] for item in members if item["email"] == address))


async def test_reports_keep_saved_reports_pins_and_schedules(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    shown = (await client.get("/v1/business/reports/figures", headers=owner.headers)).json()
    assert shown["readable"] is True
    assert [row["label"] for row in shown["figures"]["sales-summary"]["rows"]][:2] == [
        "Leads in",
        "Deals won",
    ]
    assert (await client.get("/v1/business/reports/figures", headers=agent)).status_code == 403

    pins = await client.put(
        "/v1/business/reports/pins",
        headers=owner.headers,
        json={"reports": ["profit-loss", "profit-loss", "sales-pipeline"]},
    )
    assert pins.json()["reports"] == ["profit-loss", "sales-pipeline"]
    again = await client.get("/v1/business/reports/pins", headers=owner.headers)
    assert again.json()["reports"] == ["profit-loss", "sales-pipeline"]

    saved = await client.post(
        "/v1/business/reports/saved",
        headers=owner.headers,
        json={"name": "Board pack: sales", "report": "sales-summary", "period": "quarter"},
    )
    assert saved.status_code == 201, saved.text
    listed = (await client.get("/v1/business/reports/saved", headers=owner.headers)).json()
    assert [(item["name"], item["period"], item["mine"]) for item in listed] == [
        ("Board pack: sales", "quarter", True)
    ]
    gone = await client.delete(
        f"/v1/business/reports/saved/{saved.json()['id']}", headers=owner.headers
    )
    assert gone.status_code == 204

    me = await _user_id(client, owner.headers, "owner@example.com")
    them = await _user_id(client, owner.headers, "agent@example.com")
    outsider = await client.post(
        "/v1/business/reports/schedules",
        headers=owner.headers,
        json={"report": "sales-summary", "frequency": "weekly", "recipients": [me, 999999]},
    )
    assert outsider.status_code == 422
    schedule = await client.post(
        "/v1/business/reports/schedules",
        headers=owner.headers,
        json={"report": "sales-summary", "frequency": "weekly", "recipients": [me, them]},
    )
    assert schedule.status_code == 201, schedule.text
    assert [item["email"] for item in schedule.json()["recipients"]] == [
        "owner@example.com",
        "agent@example.com",
    ]
    sent = await client.post(
        f"/v1/business/reports/schedules/{schedule.json()['id']}/send", headers=owner.headers
    )
    assert sent.status_code == 200, sent.text
    # The agent's role does not include the figures, so only the owner gets them.
    assert "role does not include" in sent.json()["lastProblem"]
    mails = [(to, body) for to, subject, body in mailbox.messages if subject.startswith("Sales")]
    assert [to for to, _ in mails] == ["owner@example.com"]
    assert "Leads in: 0" in mails[0][1]

    paused = await client.patch(
        f"/v1/business/reports/schedules/{schedule.json()['id']}",
        headers=owner.headers,
        json={"paused": True},
    )
    assert paused.json()["paused"] is True and paused.json()["nextDueAt"] is None
    await client.patch(
        f"/v1/business/reports/schedules/{schedule.json()['id']}",
        headers=owner.headers,
        json={"paused": False, "recipients": [me]},
    )

    async with admin_engine.begin() as connection:
        await connection.execute(
            text("UPDATE business_report_schedules SET next_due_at = now() - interval '1 minute'")
        )
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        assert await report_once(factory)
        assert not await report_once(factory)
    finally:
        await engine.dispose()
    mails = [to for to, subject, _ in mailbox.messages if subject.startswith("Sales")]
    assert mails == ["owner@example.com", "owner@example.com"]
    after = (await client.get("/v1/business/reports/schedules", headers=owner.headers)).json()
    assert after[0]["lastProblem"] is None and after[0]["lastSentAt"] is not None


def test_every_report_and_agent_can_be_saved_and_scheduled() -> None:
    from typing import get_args

    from janus_api.business.report_figures import ALL_NAMES
    from janus_api.business.reports import ReportId

    assert set(get_args(ReportId)) == set(ALL_NAMES)


def test_schedules_fall_due_at_nine_in_india() -> None:
    ist = ZoneInfo("Asia/Kolkata")
    friday = datetime(2026, 11, 13, 10, 0, tzinfo=ist)
    assert next_due("daily", friday) == datetime(2026, 11, 14, 9, 0, tzinfo=ist)
    assert next_due("weekly", friday) == datetime(2026, 11, 16, 9, 0, tzinfo=ist)
    assert next_due("monthly", friday) == datetime(2026, 12, 1, 9, 0, tzinfo=ist)
    early = datetime(2026, 12, 1, 8, 0, tzinfo=ist)
    assert next_due("monthly", early) == datetime(2026, 12, 1, 9, 0, tzinfo=ist)
    assert next_due("monthly", datetime(2026, 12, 5, tzinfo=ist)).month == 1


async def test_the_ai_agents_email_a_health_brief_and_a_monthly_review(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    me = await _user_id(client, owner.headers, "owner@example.com")
    bodies: dict[str, str] = {}
    for report, frequency in (("health-brief", "weekly"), ("monthly-review", "monthly")):
        made = await client.post(
            "/v1/business/reports/schedules",
            headers=owner.headers,
            json={"report": report, "frequency": frequency, "recipients": [me]},
        )
        assert made.status_code == 201, made.text
        sent = await client.post(
            f"/v1/business/reports/schedules/{made.json()['id']}/send", headers=owner.headers
        )
        assert sent.status_code == 200, sent.text
        assert sent.json()["lastProblem"] is None
        bodies[report] = mailbox.messages[-1][2]
    assert "Business health brief for" in bodies["health-brief"]
    assert "Needs you" in bodies["health-brief"]
    assert "Open the Business Overview" in bodies["health-brief"]
    assert "Monthly business review for" in bodies["monthly-review"]
    assert "against the month before" in bodies["monthly-review"]
    assert "Leads in: 0" in bodies["monthly-review"]
    # Agents are not reports: the library does not list them.
    shown = (await client.get("/v1/business/reports/figures", headers=owner.headers)).json()
    assert "health-brief" not in shown["figures"]


async def test_the_funnel_and_rep_reports_count_leads_by_how_far_they_got_and_who_owns_them(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    ids = []
    for index, name in enumerate(("Asha Traders", "Ravi Stores", "Meena Exports")):
        made = await client.post(
            "/v1/leads",
            headers={**owner.headers, "Idempotency-Key": f"funnel-{index}"},
            json={"name": name, "phone": f"98765432{index:02d}", "source": "manual"},
        )
        assert made.status_code == 201, made.text
        ids.append(made.json()["id"])
    won, lost, unowned = ids
    deal = await client.post(
        f"/v1/leads/{won}/deal",
        headers=owner.headers,
        json={"name": "Cartons", "amount": "12500.00", "stage": "new"},
    )
    assert deal.status_code == 200, deal.text
    closed = await client.put(
        f"/v1/deals/{deal.json()['id']}",
        headers=owner.headers,
        json={"name": "Cartons", "amount": "12500.00", "stage": "won", "version": 1},
    )
    assert closed.status_code == 200, closed.text
    dropped = await client.patch(
        f"/v1/leads/{lost}",
        headers=owner.headers,
        json={"name": "Ravi Stores", "phone": "9876543201", "stage": "lost"},
    )
    assert dropped.status_code == 200, dropped.text
    async with admin_engine.begin() as connection:
        await connection.execute(
            text("UPDATE leads SET owner_id = NULL WHERE id = :id"), {"id": int(unowned)}
        )

    figures = (
        await client.get("/v1/business/reports/figures?period=month", headers=owner.headers)
    ).json()["figures"]
    funnel = {row["label"]: row["value"] for row in figures["conversion-funnel"]["rows"]}
    assert funnel == {
        "Leads in": "3",
        "Qualified or further": "1 · 33%",
        "Proposal or further": "1 · 33%",
        "Won": "1 · 33%",
        "Lost": "1 · 33%",
    }
    reps = figures["rep-performance"]
    assert [(row["label"], row["value"], row["change"], row["warn"]) for row in reps["rows"]] == [
        ("Owner", "₹12,500 won", "2 new · 1 won · 0 open now", False),
        ("Nobody yet", "1 open", "1 new · nobody follows them up", True),
    ]
    assert reps["note"].startswith("1 open lead has no owner")

    # The worker emails the same report on a schedule; its role reads owners' names only through
    # app_member_names(), so the email names them too.
    me = await _user_id(client, owner.headers, "owner@example.com")
    made = await client.post(
        "/v1/business/reports/schedules",
        headers=owner.headers,
        json={
            "report": "rep-performance",
            "period": "month",
            "frequency": "weekly",
            "recipients": [me],
        },
    )
    assert made.status_code == 201, made.text
    async with admin_engine.begin() as connection:
        await connection.execute(
            text("UPDATE business_report_schedules SET next_due_at = now() - interval '1 minute'")
        )
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])
    try:
        assert await report_once(async_sessionmaker(engine, expire_on_commit=False))
    finally:
        await engine.dispose()
    body = mailbox.messages[-1][2]
    assert "Owner" in body and "₹12,500 won" in body and "Nobody yet" in body
