import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import Account, accept_new, invite, signup

TICKET = {
    "external_key": "tck-1",
    "number": "#1042",
    "subject": "Invoice total does not match the quote",
    "priority": "high",
}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> Account:
    owner = await signup(client, mailbox)
    created = await client.post("/v1/support/tickets", headers=owner.headers, json=TICKET)
    assert created.status_code == 201, created.text
    return owner


async def test_ticket_is_booked_moved_assigned_and_resolved(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/support/tickets/tck-1"
    again = await client.post("/v1/support/tickets", headers=owner.headers, json=TICKET)
    assert again.status_code == 200 and again.json()["number"] == "#1042"

    moved = await client.post(
        f"{url}/status", headers=owner.headers, json={"status": "in_progress"}
    )
    assert moved.status_code == 200 and moved.json()["status"] == "in_progress"

    assigned = await client.post(f"{url}/assign", headers=owner.headers, json={"assignee": "u-ana"})
    assert assigned.status_code == 200 and assigned.json()["assignee"] == "u-ana"

    resolved = await client.post(
        f"{url}/resolve", headers=owner.headers, json={"reason": "  Credit note issued  "}
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolution"] == "Credit note issued"

    twice = await client.post(f"{url}/resolve", headers=owner.headers, json={"reason": None})
    assert twice.status_code == 409 and twice.json()["error"]["code"] == "already_resolved"

    listed = (await client.get("/v1/support/tickets", headers=owner.headers)).json()
    assert [t["number"] for t in listed] == ["#1042"]
    assert listed[0]["status"] == "resolved" and listed[0]["assignee"] == "u-ana"

    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text("SELECT action FROM audit_log WHERE action LIKE 'support.%' ORDER BY id")
                )
            )
            .scalars()
            .all()
        )
    assert actions == [
        "support.ticket_created",
        "support.ticket_status_changed",
        "support.ticket_assigned",
        "support.ticket_resolved",
    ]


async def test_agents_cannot_book_or_change_tickets(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (await client.get("/v1/support/tickets", headers=agent)).status_code == 403
    booked = await client.post(
        "/v1/support/tickets", headers=agent, json={**TICKET, "external_key": "tck-2"}
    )
    assert booked.status_code == 403
    changed = await client.post(
        "/v1/support/tickets/tck-1/status", headers=agent, json={"status": "closed"}
    )
    assert changed.status_code == 403


async def test_invalid_input_is_refused(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await _setup(client, mailbox)
    short = await client.post(
        "/v1/support/tickets",
        headers=owner.headers,
        json={**TICKET, "external_key": "tck-3", "subject": "Hi"},
    )
    assert short.status_code == 422
    bad_priority = await client.post(
        "/v1/support/tickets",
        headers=owner.headers,
        json={**TICKET, "external_key": "tck-4", "priority": "critical"},
    )
    assert bad_priority.status_code == 422
    # Resolving goes through its own step so the resolution text is always recorded.
    resolved_by_status = await client.post(
        "/v1/support/tickets/tck-1/status", headers=owner.headers, json={"status": "resolved"}
    )
    assert resolved_by_status.status_code == 422
    missing = await client.post(
        "/v1/support/tickets/tck-99/status", headers=owner.headers, json={"status": "closed"}
    )
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "not_found"

    listed = (await client.get("/v1/support/tickets", headers=owner.headers)).json()
    assert [t["status"] for t in listed] == ["open"]


async def test_another_company_cannot_see_or_change_the_ticket(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    other = await signup(client, mailbox, "other@example.com")
    assert (await client.get("/v1/support/tickets", headers=other.headers)).json() == []
    moved = await client.post(
        "/v1/support/tickets/tck-1/status", headers=other.headers, json={"status": "closed"}
    )
    assert moved.status_code == 404
    listed = (await client.get("/v1/support/tickets", headers=owner.headers)).json()
    assert listed[0]["status"] == "open"


async def test_managers_work_tickets_in_their_support_workspace(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    manager = await accept_new(
        client, await invite(client, mailbox, owner, "lead@example.com", role="manager")
    )
    booked = await client.post(
        "/v1/support/tickets",
        headers=manager,
        json={**TICKET, "external_key": "tck-mgr"},
    )
    assert booked.status_code in (200, 201), booked.text
    listed = await client.get("/v1/support/tickets", headers=manager)
    assert listed.status_code == 200
    assert [item["external_key"] for item in listed.json()] == ["tck-mgr"]
