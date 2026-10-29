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
# Rate 2,000.00 means one unit is worth more than the 10,000.00 approval line after five units.
SAFE = {
    **BOX,
    "key": "itm-2",
    "name": "Stretch film 500 mm",
    "sku": "PK-FILM5",
    "rate_paise": 200000,
}
BATCHED = {
    **BOX,
    "key": "itm-4",
    "name": "Flour 5 kg",
    "sku": "FL-5",
    "track_batch": True,
    "rate_paise": 45000,
}
OPENING = {
    "items": [BOX, SAFE, BATCHED],
    "batches": [
        {"key": "bat-1", "item_key": "itm-4", "batch_no": "FC-2609-A", "expiry": "2027-09-30"}
    ],
    "movements": [
        {
            "key": "mv-1",
            "item_key": "itm-1",
            "location_id": 2,
            "qty": 2400,
            "reason": "Opening stock",
            "booked_on": "2026-10-01",
        },
        {
            "key": "mv-2",
            "item_key": "itm-2",
            "location_id": 1,
            "qty": 10,
            "reason": "Opening stock",
            "booked_on": "2026-10-01",
        },
        {
            "key": "mv-3",
            "item_key": "itm-4",
            "location_id": 2,
            "batch_no": "FC-2609-A",
            "qty": 30,
            "reason": "Opening stock",
            "booked_on": "2026-10-01",
        },
    ],
}


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> Account:
    owner = await signup(client, mailbox)
    imported = await client.post("/v1/operations/import", headers=owner.headers, json=OPENING)
    assert imported.status_code == 201, imported.text
    return owner


def _on_hand(ledger: dict, item_key: str, location: int) -> float:
    return sum(
        m["qty"]
        for m in ledger["movements"]
        if m["item_key"] == item_key and m["location_id"] == location
    )


async def test_opening_stock_is_imported_once(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await _setup(client, mailbox)
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-1", 2) == 2400
    assert ledger["batches"][0]["batch_no"] == "FC-2609-A"
    again = await client.post("/v1/operations/import", headers=owner.headers, json=OPENING)
    assert again.status_code == 409 and again.json()["error"]["code"] == "ledger_exists"


async def test_a_receipt_needs_a_batch_and_expiry_for_a_new_batch(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/operations/items/itm-4/receipts"
    no_batch = await client.post(
        url, headers={**owner.headers, **_key("r-nobatch")}, json={"location_id": 2, "qty": 5}
    )
    assert no_batch.status_code == 422 and no_batch.json()["error"]["code"] == "batch_required"
    no_expiry = await client.post(
        url,
        headers={**owner.headers, **_key("r-noexp")},
        json={"location_id": 2, "batch_no": "FC-2611-C", "qty": 5},
    )
    assert no_expiry.status_code == 422 and no_expiry.json()["error"]["code"] == "expiry_required"
    received = {"location_id": 2, "batch_no": "FC-2611-C", "expiry": "2027-11-30", "qty": 5}
    first = await client.post(url, headers={**owner.headers, **_key("r-1")}, json=received)
    again = await client.post(url, headers={**owner.headers, **_key("r-1")}, json=received)
    assert first.status_code == 201, first.text
    assert again.status_code == 200 and again.json()["key"] == first.json()["key"]
    changed = await client.post(
        url, headers={**owner.headers, **_key("r-1")}, json={**received, "qty": 6}
    )
    assert changed.status_code == 409
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert len([m for m in ledger["movements"] if m["batch_no"] == "FC-2611-C"]) == 1
    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text(
                        "SELECT action FROM audit_log WHERE action LIKE 'operations.%' ORDER BY id"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert actions == ["operations.ledger_imported", "operations.stock_received"]


async def test_stock_never_goes_negative_and_big_adjustments_wait_for_another_person(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    url = "/v1/operations/items/itm-2/adjustments"
    too_much = await client.post(
        url,
        headers={**owner.headers, **_key("neg-big")},
        json={"location_id": 1, "qty": -11, "reason": "Count short"},
    )
    assert too_much.status_code == 422 and too_much.json()["error"]["code"] == "insufficient_stock"

    # Five units at 2,000.00 is 10,000.00: at the line, so it is applied at once.
    small = await client.post(
        url,
        headers={**owner.headers, **_key("adj-small")},
        json={"location_id": 1, "qty": -5, "reason": "Damaged"},
    )
    assert small.status_code == 201 and small.json()["status"] == "applied"

    second_take = await client.post(
        url,
        headers={**owner.headers, **_key("adj-take-3")},
        json={"location_id": 1, "qty": -3, "reason": "Stolen"},
    )
    # Three units is 6,000.00, under the line, so it is applied at once too.
    assert second_take.json()["status"] == "applied"

    waiting = await client.post(
        url,
        headers={**owner.headers, **_key("adj-wait")},
        json={"location_id": 1, "qty": 6, "reason": "Found on shelf"},
    )
    assert waiting.status_code == 201 and waiting.json()["status"] == "pending"
    own = await client.post(
        f"/v1/operations/adjustments/{waiting.json()['id']}/approve", headers=owner.headers
    )
    assert own.status_code == 403 and own.json()["error"]["code"] == "self_approval"
    approved = await client.post(
        f"/v1/operations/adjustments/{waiting.json()['id']}/approve", headers=second
    )
    assert approved.status_code == 200 and approved.json()["status"] == "applied"
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-2", 1) == 8


async def test_approval_checks_stock_again_at_the_time_it_is_approved(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    url = "/v1/operations/items/itm-2/adjustments"
    # Ten units on hand. Taking six is worth 12,000.00, so it waits for approval.
    waiting = await client.post(
        url,
        headers={**owner.headers, **_key("wait-6")},
        json={"location_id": 1, "qty": -6, "reason": "Spoiled"},
    )
    assert waiting.json()["status"] == "pending"
    # Meanwhile five units go out, which is worth 10,000.00 and is applied at once.
    await client.post(
        url,
        headers={**owner.headers, **_key("take-5")},
        json={"location_id": 1, "qty": -5, "reason": "Sold"},
    )
    refused = await client.post(
        f"/v1/operations/adjustments/{waiting.json()['id']}/approve", headers=second
    )
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "insufficient_stock"


async def test_a_pending_adjustment_can_be_rejected_by_another_person(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    waiting = await client.post(
        "/v1/operations/items/itm-2/adjustments",
        headers={**owner.headers, **_key("rej")},
        json={"location_id": 1, "qty": 6, "reason": "Found on shelf"},
    )
    own = await client.post(
        f"/v1/operations/adjustments/{waiting.json()['id']}/reject",
        headers=owner.headers,
        json={"reason": "Not mine to reject"},
    )
    assert own.status_code == 403
    rejected = await client.post(
        f"/v1/operations/adjustments/{waiting.json()['id']}/reject",
        headers=second,
        json={"reason": "Count was wrong"},
    )
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-2", 1) == 10


async def test_items_are_created_once_and_skus_stay_unique(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    new_item = {**BOX, "key": "itm-9", "name": "Brown tape 48 mm", "sku": "TP-48"}
    created = await client.post("/v1/operations/items", headers=owner.headers, json=new_item)
    again = await client.post("/v1/operations/items", headers=owner.headers, json=new_item)
    assert created.status_code == 201 and again.status_code == 200
    clash = await client.post(
        "/v1/operations/items",
        headers=owner.headers,
        json={**new_item, "key": "itm-10", "sku": "tp-48"},
    )
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "sku_exists"
    bad_hsn = await client.post(
        "/v1/operations/items",
        headers=owner.headers,
        json={**new_item, "key": "itm-11", "sku": "X-1", "hsn": "12"},
    )
    assert bad_hsn.status_code == 422


async def test_agents_cannot_change_stock(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await _setup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (await client.get("/v1/operations/ledger", headers=agent)).status_code == 403
    denied = await client.post(
        "/v1/operations/items/itm-2/adjustments",
        headers={**agent, **_key("agent")},
        json={"location_id": 1, "qty": 1, "reason": "Try"},
    )
    assert denied.status_code == 403


async def test_another_company_cannot_see_or_move_the_stock(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    other = await signup(client, mailbox, "other@example.com")
    empty = (await client.get("/v1/operations/ledger", headers=other.headers)).json()
    assert empty["items"] == [] and empty["movements"] == []
    moved = await client.post(
        "/v1/operations/items/itm-2/receipts",
        headers={**other.headers, **_key("steal")},
        json={"location_id": 1, "qty": 5},
    )
    assert moved.status_code == 404
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-2", 1) == 10
