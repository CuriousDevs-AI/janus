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
    "batches": [],
    "movements": [
        {
            "key": "mv-1",
            "item_key": "itm-1",
            "location_id": 2,
            "qty": 100,
            "reason": "Opening stock",
            "booked_on": "2026-10-01",
        },
    ],
    "purchase_orders": [
        {
            "key": "po-1",
            "number": "PO-2026-0101",
            "vendor": "Gurugram Packaging Co",
            "location_id": 2,
            "lines": [{"item_key": "itm-1", "qty": 1000, "rate_paise": 4500}],
        }
    ],
}
ORDER = {
    "key": "po-9",
    "vendor": "Udyog Packaging",
    "location_id": 1,
    "lines": [{"item_key": "itm-1", "qty": 200, "rate_paise": 4500}],
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


async def test_an_order_is_raised_and_goods_received_against_it_up_to_what_is_due(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await _setup(client, mailbox)
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert [po["number"] for po in ledger["purchase_orders"]] == ["PO-2026-0101"]

    raised = await client.post(
        "/v1/operations/purchase-orders", headers={**owner.headers, **_key("po-new")}, json=ORDER
    )
    assert raised.status_code == 201, raised.text
    assert raised.json()["number"] == "PO-2026-0102" and raised.json()["lines"][0]["received"] == 0
    again = await client.post(
        "/v1/operations/purchase-orders", headers={**owner.headers, **_key("po-new")}, json=ORDER
    )
    assert again.status_code == 200 and again.json()["id"] == "po-9"

    url = "/v1/operations/purchase-orders/po-1/receive"
    received = await client.post(
        url,
        headers={**owner.headers, **_key("rcv-1")},
        json={"receipts": [{"item_key": "itm-1", "qty": 300}]},
    )
    assert received.status_code == 200, received.text
    assert received.json()["lines"][0]["received"] == 300
    replay = await client.post(
        url,
        headers={**owner.headers, **_key("rcv-1")},
        json={"receipts": [{"item_key": "itm-1", "qty": 300}]},
    )
    assert replay.status_code == 200 and replay.json()["lines"][0]["received"] == 300

    too_many = await client.post(
        url,
        headers={**owner.headers, **_key("rcv-big")},
        json={"receipts": [{"item_key": "itm-1", "qty": 701}]},
    )
    assert too_many.status_code == 422 and too_many.json()["error"]["code"] == "over_receipt"

    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-1", 2) == 400
    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text(
                        "SELECT action FROM audit_log "
                        "WHERE action IN ('operations.purchase_order_raised', "
                        "'operations.goods_received') ORDER BY id"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert actions == ["operations.purchase_order_raised", "operations.goods_received"]


async def test_batch_items_and_items_not_on_the_order_are_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    flour_order = {
        "key": "po-flour",
        "vendor": "Flour Mills",
        "location_id": 2,
        "lines": [{"item_key": "itm-4", "qty": 10, "rate_paise": 45000}],
    }
    await client.post(
        "/v1/operations/purchase-orders", headers={**owner.headers, **_key("pf")}, json=flour_order
    )
    batch = await client.post(
        "/v1/operations/purchase-orders/po-flour/receive",
        headers={**owner.headers, **_key("rf")},
        json={"receipts": [{"item_key": "itm-4", "qty": 5}]},
    )
    assert batch.status_code == 422 and batch.json()["error"]["code"] == "batch_item"
    not_on = await client.post(
        "/v1/operations/purchase-orders/po-1/receive",
        headers={**owner.headers, **_key("rn")},
        json={"receipts": [{"item_key": "itm-4", "qty": 1}]},
    )
    assert not_on.status_code == 422 and not_on.json()["error"]["code"] == "not_on_order"
    unknown = await client.post(
        "/v1/operations/purchase-orders",
        headers={**owner.headers, **_key("pu")},
        json={**ORDER, "key": "po-u", "lines": [{"item_key": "itm-99", "qty": 1, "rate_paise": 1}]},
    )
    assert unknown.status_code == 404


async def test_only_stock_managers_raise_orders_and_other_companies_cannot_receive(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    denied = await client.post(
        "/v1/operations/purchase-orders", headers={**agent, **_key("pa")}, json=ORDER
    )
    assert denied.status_code == 403
    denied_receipt = await client.post(
        "/v1/operations/purchase-orders/po-1/receive",
        headers={**agent, **_key("pr")},
        json={"receipts": [{"item_key": "itm-1", "qty": 1}]},
    )
    assert denied_receipt.status_code == 403
    other = await signup(client, mailbox, "other@example.com")
    hidden = await client.post(
        "/v1/operations/purchase-orders/po-1/receive",
        headers={**other.headers, **_key("po")},
        json={"receipts": [{"item_key": "itm-1", "qty": 1}]},
    )
    assert hidden.status_code == 404
    listed = (await client.get("/v1/operations/ledger", headers=other.headers)).json()
    assert listed["purchase_orders"] == []
