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


def test_schedules_fall_due_at_nine_in_india() -> None:
    ist = ZoneInfo("Asia/Kolkata")
    friday = datetime(2026, 11, 13, 10, 0, tzinfo=ist)
    assert next_due("daily", friday) == datetime(2026, 11, 14, 9, 0, tzinfo=ist)
    assert next_due("weekly", friday) == datetime(2026, 11, 16, 9, 0, tzinfo=ist)
    assert next_due("monthly", friday) == datetime(2026, 12, 1, 9, 0, tzinfo=ist)
    early = datetime(2026, 12, 1, 8, 0, tzinfo=ist)
    assert next_due("monthly", early) == datetime(2026, 12, 1, 9, 0, tzinfo=ist)
    assert next_due("monthly", datetime(2026, 12, 5, tzinfo=ist)).month == 1
