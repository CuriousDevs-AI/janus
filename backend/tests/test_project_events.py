import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

KEY = "prj-400"
PROJECT = {
    "external_key": KEY,
    "name": "Events project",
    "client": "Rajputana Co-op",
    "status": "active",
    "budget": "50000.00",
    "start_on": "2026-10-01",
    "end_on": "2026-12-15",
}


async def test_module_actions_write_events_and_closing_carries_the_summary(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    base = f"/v1/project-records/{KEY}"
    await client.post("/v1/project-records", headers=owner.headers, json=PROJECT)
    await client.post(
        "/v1/project-timelines", headers=owner.headers, json={"project_key": KEY, "name": "Events"}
    )
    await client.post(
        f"{base}/milestones",
        headers=owner.headers,
        json={
            "external_key": "ms-1",
            "name": "Agreement",
            "due_on": "2026-10-20",
            "amount": "15000",
        },
    )
    await client.post(
        f"{base}/milestones/ms-1/status", headers=owner.headers, json={"status": "done"}
    )
    accepted = await client.post(
        f"{base}/milestones/ms-1/status", headers=second, json={"status": "accepted"}
    )
    assert accepted.status_code == 200, accepted.text

    change = await client.post(
        f"{base}/changes",
        headers=owner.headers,
        json={"description": "Add a loading bay", "budget_change": "0", "day_change": 1},
    )
    await client.post(
        f"{base}/changes/{change.json()['id']}/decision", headers=second, json={"approve": True}
    )
    await client.post(
        f"{base}/hours",
        headers=owner.headers,
        json={
            "user_id": (await client.get("/v1/me", headers=owner.headers)).json()["user"]["id"],
            "work_on": "2026-10-23",
            "hours": "3",
        },
    )
    await client.patch(f"{base}", headers=owner.headers, json={"status": "on hold"})

    entries = (
        await client.get(f"/v1/project-timelines/{KEY}/entries", headers=owner.headers)
    ).json()
    events = [e for e in entries if e["kind"] == "event"]
    kinds = [e["payload"]["event"] for e in events]
    assert kinds == ["milestone", "milestone", "change", "system"]
    assert [e["body"] for e in events[:2]] == ["milestone: Agreement is done", "milestone: Agreement is accepted"]
    assert events[2]["body"] == "change: Add a loading bay was approved"
    assert events[3]["body"] == "system: Status changed from active to on hold"

    archived = await client.post(f"/v1/project-timelines/{KEY}/archive", headers=owner.headers)
    assert archived.status_code == 200
    entries = (
        await client.get(f"/v1/project-timelines/{KEY}/entries", headers=owner.headers)
    ).json()
    closing = [e for e in entries if e["kind"] == "event" and e["payload"]["event"] == "closed"][0]
    summary = closing["payload"]["summary"]
    assert summary["milestones_accepted"] == 1 and summary["milestones_total"] == 1
    assert summary["approved_changes"] == 1
    assert float(summary["hours"]) == 3.0
    assert float(summary["billed"]) == 15000.0
    assert float(summary["budget"]) == 50000.0


async def test_closing_a_project_only_on_the_screens_has_no_server_summary(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    await client.post(
        "/v1/project-timelines",
        headers=owner.headers,
        json={"project_key": "screens-only", "name": "Screens"},
    )
    await client.post("/v1/project-timelines/screens-only/archive", headers=owner.headers)
    entries = (
        await client.get("/v1/project-timelines/screens-only/entries", headers=owner.headers)
    ).json()
    closing = [e for e in entries if e["kind"] == "event"][0]
    assert closing["payload"]["summary"] is None
