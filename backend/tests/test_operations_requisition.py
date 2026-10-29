import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import Account, accept_new, invite, signup

BOX = {
    "key": "itm-1",
    "name": "Corrugated box 12 x 9 in",
    "sku": "PK-1209",
    "unit": "piece",
    "hsn": "4819",
    "rate_paise": 2800,
    "gst_rate": 12,
    "reorder_level": 500,
    "track_batch": False,
}
OPENING = {"items": [BOX], "batches": [], "movements": []}
LINE = {
    "external_key": "line-sales",
    "name": "Packaging",
    "owner_name": "Arjun Mehta",
    "allocated_paise": 3000000,
}
REQUEST = {
    "key": "req-1",
    "item_key": "itm-1",
    "qty": 100,
    "estimated_rate_paise": 4500,
    "location_id": 2,
    "budget_line_key": "line-sales",
    "reason": "Festive dispatch packing",
}


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> Account:
    owner = await signup(client, mailbox)
    assert (
        await client.post("/v1/operations/import", headers=owner.headers, json=OPENING)
    ).status_code == 201
    line = await client.post("/v1/finance/budget-lines", headers=owner.headers, json=LINE)
    assert line.status_code == 201, line.text
    return owner


async def test_a_requisition_is_raised_approved_and_ordered_once(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await _setup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    raised = await client.post(
        "/v1/operations/requisitions", headers={**owner.headers, **_key("r-1")}, json=REQUEST
    )
    assert raised.status_code == 201, raised.text
    body = raised.json()
    assert body["number"].startswith("REQ-") and body["status"] == "pending"
    again = await client.post(
        "/v1/operations/requisitions", headers={**owner.headers, **_key("r-1")}, json=REQUEST
    )
    assert again.status_code == 200 and again.json()["id"] == "req-1"

    own = await client.post("/v1/operations/requisitions/req-1/approve", headers=owner.headers)
    assert own.status_code == 403 and own.json()["error"]["code"] == "self_approval"
    approved = await client.post("/v1/operations/requisitions/req-1/approve", headers=second)
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    assert approved.json()["decided_by"] == "Owner" or approved.json()["decided_by"]
    twice = await client.post("/v1/operations/requisitions/req-1/approve", headers=second)
    assert twice.status_code == 409

    ordered = await client.post(
        "/v1/operations/requisitions/req-1/order",
        headers=owner.headers,
        json={"vendor": "Gurugram Packaging Co"},
    )
    assert ordered.status_code == 200, ordered.text
    assert ordered.json()["status"] == "ordered" and ordered.json()["po_number"].startswith("PO-")
    reorder = await client.post(
        "/v1/operations/requisitions/req-1/order",
        headers=owner.headers,
        json={"vendor": "Gurugram Packaging Co"},
    )
    assert reorder.status_code == 409 and reorder.json()["error"]["code"] == "not_approved"
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert [po["vendor"] for po in ledger["purchase_orders"]] == ["Gurugram Packaging Co"]
    assert [r["status"] for r in ledger["requisitions"]] == ["ordered"]
    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text(
                        "SELECT action FROM audit_log WHERE action IN "
                        "('operations.requisition_raised', 'operations.requisition_approved', "
                        "'operations.requisition_ordered') ORDER BY id"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert actions == [
        "operations.requisition_raised",
        "operations.requisition_approved",
        "operations.requisition_ordered",
    ]


async def test_approval_reads_the_budget_on_the_server_and_refuses_more_than_is_left(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    big = {**REQUEST, "key": "req-big", "qty": 1000}
    await client.post(
        "/v1/operations/requisitions", headers={**owner.headers, **_key("big")}, json=big
    )
    refused = await client.post("/v1/operations/requisitions/req-big/approve", headers=second)
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "over_budget"
    rejected = await client.post(
        "/v1/operations/requisitions/req-big/reject",
        headers=second,
        json={"reason": "Over the line"},
    )
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    late = await client.post("/v1/operations/requisitions/req-big/approve", headers=second)
    assert late.status_code == 409


async def test_bad_requests_and_other_roles_are_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/operations/requisitions"
    short = await client.post(
        url,
        headers={**owner.headers, **_key("short")},
        json={**REQUEST, "key": "r-s", "reason": "no"},
    )
    assert short.status_code == 422
    no_budget = await client.post(
        url,
        headers={**owner.headers, **_key("nb")},
        json={**REQUEST, "key": "r-nb", "budget_line_key": "nope"},
    )
    assert (
        no_budget.status_code == 422
        and no_budget.json()["error"]["code"] == "budget_line_not_found"
    )
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    denied = await client.post(
        url, headers={**agent, **_key("ag")}, json={**REQUEST, "key": "r-ag"}
    )
    assert denied.status_code == 403
    await client.post(url, headers={**owner.headers, **_key("ok")}, json=REQUEST)
    other = await signup(client, mailbox, "other@example.com")
    hidden = await client.post("/v1/operations/requisitions/req-1/approve", headers=other.headers)
    assert hidden.status_code == 404
    listed = (await client.get("/v1/operations/ledger", headers=other.headers)).json()
    assert listed["requisitions"] == []
