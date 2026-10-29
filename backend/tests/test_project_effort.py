import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

PROJECT = {
    "external_key": "prj-300",
    "name": "Dock layout",
    "client": "Internal",
    "status": "active",
    "budget": "78000.00",
    "start_on": "2026-10-10",
    "end_on": "2026-11-20",
}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox):
    owner = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    await client.post("/v1/project-records", headers=owner.headers, json=PROJECT)
    owner_id = (await client.get("/v1/me", headers=owner.headers)).json()["user"]["id"]
    return owner, second, owner_id


async def test_hours_are_capped_at_twelve_a_day(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, owner_id = await _setup(client, mailbox)
    day = {"user_id": owner_id, "work_on": "2026-10-23", "hours": "8"}
    first = await client.post("/v1/project-records/prj-300/hours", headers=owner.headers, json=day)
    assert first.status_code == 201, first.text
    over = await client.post(
        "/v1/project-records/prj-300/hours", headers=owner.headers, json={**day, "hours": "5"}
    )
    assert over.status_code == 422
    assert over.json()["error"]["code"] == "day_over_12"
    other_day = await client.post(
        "/v1/project-records/prj-300/hours",
        headers=owner.headers,
        json={**day, "work_on": "2026-10-24", "hours": "5"},
    )
    assert other_day.status_code == 201


async def test_allocation_is_set_and_updated(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner, _, owner_id = await _setup(client, mailbox)
    set_once = await client.put(
        "/v1/project-records/prj-300/allocations",
        headers=owner.headers,
        json={"user_id": owner_id, "percent": 40},
    )
    assert set_once.status_code == 200 and set_once.json()["percent"] == 40
    updated = await client.put(
        "/v1/project-records/prj-300/allocations",
        headers=owner.headers,
        json={"user_id": owner_id, "percent": 60},
    )
    assert updated.json()["percent"] == 60


async def test_a_change_is_decided_by_someone_else_once(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, second, _ = await _setup(client, mailbox)
    requested = await client.post(
        "/v1/project-records/prj-300/changes",
        headers=owner.headers,
        json={"description": "Add a loading bay", "budget_change": "4000", "day_change": 2},
    )
    assert requested.status_code == 201, requested.text
    change_id = requested.json()["id"]
    assert requested.json()["status"] == "pending"

    own = await client.post(
        f"/v1/project-records/prj-300/changes/{change_id}/decision",
        headers=owner.headers,
        json={"approve": True},
    )
    assert own.status_code == 403

    approved = await client.post(
        f"/v1/project-records/prj-300/changes/{change_id}/decision",
        headers=second,
        json={"approve": True},
    )
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    again = await client.post(
        f"/v1/project-records/prj-300/changes/{change_id}/decision",
        headers=second,
        json={"approve": False},
    )
    assert again.status_code == 409


async def test_effort_needs_project_rights_and_stays_in_the_company(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, owner_id = await _setup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (
        await client.put(
            "/v1/project-records/prj-300/allocations",
            headers=agent,
            json={"user_id": owner_id, "percent": 10},
        )
    ).status_code == 403
    other = await signup(client, mailbox, "other@example.com")
    assert (
        await client.post(
            "/v1/project-records/prj-300/hours",
            headers=other.headers,
            json={"user_id": owner_id, "work_on": "2026-10-23", "hours": "2"},
        )
    ).status_code == 404
