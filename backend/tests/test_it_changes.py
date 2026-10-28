import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

REQUEST = {"title": "Move the billing server to a new host", "risk": "medium"}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox):
    owner = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    return owner, second


async def test_change_is_requested_approved_and_carried_out(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner, second = await _setup(client, mailbox)
    requested = await client.post("/v1/it/changes", headers=owner.headers, json=REQUEST)
    assert requested.status_code == 201, requested.text
    body = requested.json()
    assert body["number"] == "CHG-1002" and body["status"] == "pending"
    change_id = body["id"]

    approved = await client.post(
        f"/v1/it/changes/{change_id}/decision", headers=second, json={"approve": True}
    )
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    done = await client.post(f"/v1/it/changes/{change_id}/complete", headers=second)
    assert done.status_code == 200 and done.json()["status"] == "done"

    listed = (await client.get("/v1/it/changes", headers=owner.headers)).json()
    assert [c["number"] for c in listed] == ["CHG-1002"]

    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text("SELECT action FROM audit_log WHERE action LIKE 'it.change_%' ORDER BY id")
                )
            )
            .scalars()
            .all()
        )
    assert actions == ["it.change_requested", "it.change_decided", "it.change_completed"]


async def test_requester_cannot_approve_and_decisions_happen_once(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, second = await _setup(client, mailbox)
    change_id = (await client.post("/v1/it/changes", headers=owner.headers, json=REQUEST)).json()[
        "id"
    ]

    early = await client.post(f"/v1/it/changes/{change_id}/complete", headers=owner.headers)
    assert early.status_code == 409 and early.json()["error"]["code"] == "not_approved"

    own = await client.post(
        f"/v1/it/changes/{change_id}/decision", headers=owner.headers, json={"approve": True}
    )
    assert own.status_code == 403 and own.json()["error"]["code"] == "self_decision"

    first = await client.post(
        f"/v1/it/changes/{change_id}/decision", headers=second, json={"approve": False}
    )
    assert first.status_code == 200 and first.json()["status"] == "rejected"
    again = await client.post(
        f"/v1/it/changes/{change_id}/decision", headers=second, json={"approve": True}
    )
    assert again.status_code == 409 and again.json()["error"]["code"] == "decided"


async def test_invalid_input_and_permission_are_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _ = await _setup(client, mailbox)
    short = await client.post(
        "/v1/it/changes", headers=owner.headers, json={"title": "Fix", "risk": "medium"}
    )
    assert short.status_code == 422
    bad_risk = await client.post(
        "/v1/it/changes", headers=owner.headers, json={**REQUEST, "risk": "extreme"}
    )
    assert bad_risk.status_code == 422

    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (await client.post("/v1/it/changes", headers=agent, json=REQUEST)).status_code == 403
    assert (await client.get("/v1/it/changes", headers=agent)).status_code == 403


async def test_another_company_cannot_see_or_decide_a_change(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, second = await _setup(client, mailbox)
    change_id = (await client.post("/v1/it/changes", headers=owner.headers, json=REQUEST)).json()[
        "id"
    ]
    other = await signup(client, mailbox, "other@example.com")
    assert (await client.get("/v1/it/changes", headers=other.headers)).json() == []
    decided = await client.post(
        f"/v1/it/changes/{change_id}/decision", headers=other.headers, json={"approve": True}
    )
    assert decided.status_code == 404
