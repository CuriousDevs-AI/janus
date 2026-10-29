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
FLOUR = {
    **BOX,
    "key": "itm-4",
    "name": "Flour 5 kg",
    "sku": "FL-5",
    "track_batch": True,
    "rate_paise": 45000,
}
OPENING = {
    "items": [BOX, FLOUR],
    "batches": [
        {"key": "bat-1", "item_key": "itm-4", "batch_no": "FC-2609-A", "expiry": "2027-09-30"},
        {"key": "bat-2", "item_key": "itm-4", "batch_no": "FC-2401-X", "expiry": "2024-01-01"},
    ],
    "movements": [
        {
            "key": "mv-1",
            "item_key": "itm-1",
            "location_id": 2,
            "qty": 100,
            "reason": "Opening stock",
            "booked_on": "2026-10-01",
        },
        {
            "key": "mv-2",
            "item_key": "itm-4",
            "location_id": 2,
            "batch_no": "FC-2609-A",
            "qty": 30,
            "reason": "Opening stock",
            "booked_on": "2026-10-01",
        },
        {
            "key": "mv-3",
            "item_key": "itm-4",
            "location_id": 2,
            "batch_no": "FC-2401-X",
            "qty": 20,
            "reason": "Opening stock",
            "booked_on": "2026-10-01",
        },
    ],
}
DISPATCH = {
    "location_id": 2,
    "customer": "Metro Value Mart",
    "customer_company": "Metro Value Mart Pvt Ltd",
    "transporter": "Blue Dart",
    "lines": [{"item_key": "itm-1", "qty": 40, "rate_paise": 2800}],
}


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> Account:
    owner = await signup(client, mailbox)
    imported = await client.post("/v1/operations/import", headers=owner.headers, json=OPENING)
    assert imported.status_code == 201, imported.text
    return owner


async def _book(
    client: httpx.AsyncClient, owner: Account, key: str, body: dict | None = None
) -> dict:
    created = await client.post(
        "/v1/operations/dispatches", headers={**owner.headers, **_key(key)}, json=body or DISPATCH
    )
    assert created.status_code == 201, created.text
    return created.json()


def _on_hand(ledger: dict, item_key: str, location: int, batch: str | None = None) -> float:
    return sum(
        m["qty"]
        for m in ledger["movements"]
        if m["item_key"] == item_key and m["location_id"] == location and m["batch_no"] == batch
    )


async def test_a_dispatch_takes_stock_out_and_a_retry_books_once(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await _setup(client, mailbox)
    booked = await _book(client, owner, "dsp-1")
    assert booked["number"].startswith("DN-") and booked["number"].endswith("-0101")
    assert booked["challan_no"].startswith("DC-") and booked["status"] == "dispatched"
    again = await client.post(
        "/v1/operations/dispatches", headers={**owner.headers, **_key("dsp-1")}, json=DISPATCH
    )
    assert again.status_code == 200 and again.json()["id"] == booked["id"]
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-1", 2) == 60
    assert [d["number"] for d in ledger["dispatches"]] == [booked["number"]]
    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text("SELECT action FROM audit_log WHERE action = 'operations.dispatch_booked'")
                )
            )
            .scalars()
            .all()
        )
    assert actions == ["operations.dispatch_booked"]


async def test_a_dispatch_cannot_take_more_than_is_in_stock(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    too_many = await client.post(
        "/v1/operations/dispatches",
        headers={**owner.headers, **_key("big")},
        json={
            **DISPATCH,
            "lines": [
                {"item_key": "itm-1", "qty": 60, "rate_paise": 2800},
                {"item_key": "itm-1", "qty": 41, "rate_paise": 2800},
            ],
        },
    )
    assert too_many.status_code == 422 and too_many.json()["error"]["code"] == "insufficient_stock"
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-1", 2) == 100 and ledger["dispatches"] == []


async def test_expired_and_unknown_batches_are_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/operations/dispatches"
    expired = await client.post(
        url,
        headers={**owner.headers, **_key("exp")},
        json={
            **DISPATCH,
            "lines": [
                {"item_key": "itm-4", "batch_no": "FC-2401-X", "qty": 5, "rate_paise": 45000}
            ],
        },
    )
    assert expired.status_code == 422 and expired.json()["error"]["code"] == "batch_expired"
    no_batch = await client.post(
        url,
        headers={**owner.headers, **_key("nob")},
        json={**DISPATCH, "lines": [{"item_key": "itm-4", "qty": 5, "rate_paise": 45000}]},
    )
    assert no_batch.status_code == 422 and no_batch.json()["error"]["code"] == "batch_required"
    unknown = await client.post(
        url,
        headers={**owner.headers, **_key("unk")},
        json={
            **DISPATCH,
            "lines": [{"item_key": "itm-4", "batch_no": "ZZ-1", "qty": 5, "rate_paise": 45000}],
        },
    )
    assert unknown.status_code == 422 and unknown.json()["error"]["code"] == "unknown_batch"


async def test_goods_are_picked_packed_shipped_then_delivered_with_proof(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    booked = await _book(client, owner, "dsp-2")
    url = f"/v1/operations/dispatches/{booked['id']}"
    early = await client.post(f"{url}/checkpoints/packed", headers=owner.headers)
    assert early.status_code == 409 and early.json()["error"]["code"] == "out_of_order"
    undelivered = await client.post(
        f"{url}/deliver", headers=owner.headers, json={"proof": "Signed challan"}
    )
    assert undelivered.status_code == 409 and undelivered.json()["error"]["code"] == "not_shipped"
    for stage in ("picked", "packed", "shipped"):
        step = await client.post(f"{url}/checkpoints/{stage}", headers=owner.headers)
        assert step.status_code == 200 and step.json()[stage]
    again = await client.post(f"{url}/checkpoints/picked", headers=owner.headers)
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_done"
    no_proof = await client.post(f"{url}/deliver", headers=owner.headers, json={"proof": "no"})
    assert no_proof.status_code == 422
    delivered = await client.post(
        f"{url}/deliver", headers=owner.headers, json={"proof": "Receiver: R. Singh"}
    )
    assert delivered.status_code == 200 and delivered.json()["status"] == "delivered"
    assert delivered.json()["proof"] == "Receiver: R. Singh"
    closed = await client.post(f"{url}/deliver", headers=owner.headers, json={"proof": "Again"})
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "delivered"


async def test_returns_restock_only_good_goods_after_inspection(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    booked = await _book(client, owner, "dsp-3")
    url = "/v1/operations/returns"
    too_many = await client.post(
        url,
        headers={**owner.headers, **_key("rma-big")},
        json={
            "dispatch_id": int(booked["id"]),
            "item_key": "itm-1",
            "qty": 41,
            "reason": "Crushed cartons",
        },
    )
    assert too_many.status_code == 422 and too_many.json()["error"]["code"] == "over_return"
    not_on = await client.post(
        url,
        headers={**owner.headers, **_key("rma-none")},
        json={
            "dispatch_id": int(booked["id"]),
            "item_key": "itm-4",
            "qty": 1,
            "reason": "Wrong item",
        },
    )
    assert not_on.status_code == 422 and not_on.json()["error"]["code"] == "not_on_dispatch"
    authorised = await client.post(
        url,
        headers={**owner.headers, **_key("rma-1")},
        json={
            "dispatch_id": int(booked["id"]),
            "item_key": "itm-1",
            "qty": 5,
            "reason": "Crushed cartons",
        },
    )
    assert authorised.status_code == 201, authorised.text
    rma = authorised.json()
    assert rma["status"] == "authorised" and rma["number"].startswith("RMA-")
    damaged = await client.post(
        f"{url}/{rma['id']}/inspect", headers=owner.headers, json={"condition": "damaged"}
    )
    assert damaged.status_code == 200 and damaged.json()["status"] == "inspected"
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-1", 2) == 60
    twice = await client.post(
        f"{url}/{rma['id']}/inspect", headers=owner.headers, json={"condition": "good"}
    )
    assert twice.status_code == 409 and twice.json()["error"]["code"] == "already_inspected"

    good = await client.post(
        url,
        headers={**owner.headers, **_key("rma-2")},
        json={
            "dispatch_id": int(booked["id"]),
            "item_key": "itm-1",
            "qty": 4,
            "reason": "Wrong size",
        },
    )
    inspected = await client.post(
        f"{url}/{good.json()['id']}/inspect", headers=owner.headers, json={"condition": "good"}
    )
    assert inspected.status_code == 200 and inspected.json()["condition"] == "good"
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-1", 2) == 64


async def test_agents_and_other_companies_cannot_dispatch(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    booked = await _book(client, owner, "dsp-4")
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    denied = await client.post(
        "/v1/operations/dispatches", headers={**agent, **_key("agent")}, json=DISPATCH
    )
    assert denied.status_code == 403
    other = await signup(client, mailbox, "other@example.com")
    hidden = await client.get(f"/v1/operations/dispatches/{booked['id']}", headers=other.headers)
    assert hidden.status_code == 404
    moved = await client.post(
        f"/v1/operations/dispatches/{booked['id']}/checkpoints/picked", headers=other.headers
    )
    assert moved.status_code == 404
