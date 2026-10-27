import httpx
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

STORE = "janus.finance.v1"


async def test_store_round_trip_with_versions(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await signup(client, mailbox)
    empty = await client.get(f"/v1/workspace-state/{STORE}", headers=owner.headers)
    assert empty.status_code == 200
    assert empty.json() == {"store_key": STORE, "version": 0, "data": None}

    first = await client.put(
        f"/v1/workspace-state/{STORE}",
        headers=owner.headers,
        json={"data": {"invoices": [{"number": "INV-1"}]}, "expected_version": 0},
    )
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1

    second = await client.put(
        f"/v1/workspace-state/{STORE}",
        headers=owner.headers,
        json={"data": {"invoices": []}, "expected_version": 1},
    )
    assert second.status_code == 200, second.text
    assert second.json()["version"] == 2

    latest = await client.get(f"/v1/workspace-state/{STORE}", headers=owner.headers)
    assert latest.json()["data"] == {"invoices": []}


async def test_stale_save_is_refused_and_nothing_is_overwritten(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    await client.put(
        f"/v1/workspace-state/{STORE}",
        headers=owner.headers,
        json={"data": {"n": 1}, "expected_version": 0},
    )
    stale = await client.put(
        f"/v1/workspace-state/{STORE}",
        headers=owner.headers,
        json={"data": {"n": 2}, "expected_version": 0},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "version_conflict"
    latest = await client.get(f"/v1/workspace-state/{STORE}", headers=owner.headers)
    assert latest.json() == {"store_key": STORE, "version": 1, "data": {"n": 1}}


async def test_unknown_store_and_no_session_are_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    unknown = await client.get("/v1/workspace-state/janus.not-a-store", headers=owner.headers)
    assert unknown.status_code == 404
    anonymous = await client.get(f"/v1/workspace-state/{STORE}")
    assert anonymous.status_code == 401


async def test_companies_cannot_see_each_others_stores(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    other = await signup(client, mailbox, "other@example.com")
    await client.put(
        f"/v1/workspace-state/{STORE}",
        headers=owner.headers,
        json={"data": {"secret": "a"}, "expected_version": 0},
    )
    seen = await client.get(f"/v1/workspace-state/{STORE}", headers=other.headers)
    assert seen.json() == {"store_key": STORE, "version": 0, "data": None}


async def test_member_without_the_module_permission_cannot_write(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    read = await client.get(f"/v1/workspace-state/{STORE}", headers=agent)
    assert read.status_code == 200
    write = await client.put(
        f"/v1/workspace-state/{STORE}",
        headers=agent,
        json={"data": {"x": 1}, "expected_version": 0},
    )
    assert write.status_code == 403


async def test_manager_can_run_stock_and_projects_but_not_finance(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    manager = await accept_new(
        client, await invite(client, mailbox, owner, "manager@example.com", role="manager")
    )
    for key, expected in [
        ("janus.operations.v1", 200),
        ("janus.projects.v1", 200),
        ("janus.finance.v1", 403),
    ]:
        response = await client.put(
            f"/v1/workspace-state/{key}",
            headers=manager,
            json={"data": {"ok": True}, "expected_version": 0},
        )
        assert response.status_code == expected, (key, response.text)
