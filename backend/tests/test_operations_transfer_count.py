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
        {"key": "bat-1", "item_key": "itm-4", "batch_no": "FC-2609-A", "expiry": "2027-09-30"}
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
    ],
}
TRANSFER = {
    "item_key": "itm-1",
    "qty": 40,
    "from_location_id": 2,
    "to_location_id": 3,
    "transporter": "Gati Kintetsu",
}


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> Account:
    owner = await signup(client, mailbox)
    imported = await client.post("/v1/operations/import", headers=owner.headers, json=OPENING)
    assert imported.status_code == 201, imported.text
    return owner


def _on_hand(ledger: dict, item_key: str, location: int, batch: str | None = None) -> float:
    return sum(
        m["qty"]
        for m in ledger["movements"]
        if m["item_key"] == item_key and m["location_id"] == location and m["batch_no"] == batch
    )


async def test_a_transfer_leaves_the_sender_and_arrives_when_received(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await _setup(client, mailbox)
    sent = await client.post(
        "/v1/operations/transfers", headers={**owner.headers, **_key("t-1")}, json=TRANSFER
    )
    assert sent.status_code == 201, sent.text
    body = sent.json()
    assert body["number"].startswith("TRF-") and body["status"] == "in transit"
    again = await client.post(
        "/v1/operations/transfers", headers={**owner.headers, **_key("t-1")}, json=TRANSFER
    )
    assert again.status_code == 200 and again.json()["id"] == body["id"]
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-1", 2) == 60 and _on_hand(ledger, "itm-1", 3) == 0

    received = await client.post(
        f"/v1/operations/transfers/{body['id']}/receive", headers=owner.headers
    )
    assert received.status_code == 200 and received.json()["status"] == "received"
    twice = await client.post(
        f"/v1/operations/transfers/{body['id']}/receive", headers=owner.headers
    )
    assert twice.status_code == 409 and twice.json()["error"]["code"] == "already_received"
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-1", 2) == 60 and _on_hand(ledger, "itm-1", 3) == 40
    assert [t["number"] for t in ledger["transfers"]] == [body["number"]]
    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text(
                        "SELECT action FROM audit_log "
                        "WHERE action LIKE 'operations.transfer%' ORDER BY id"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert actions == ["operations.transfer_sent", "operations.transfer_received"]


async def test_a_transfer_is_checked_before_stock_moves(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/operations/transfers"
    too_many = await client.post(
        url, headers={**owner.headers, **_key("big")}, json={**TRANSFER, "qty": 101}
    )
    assert too_many.status_code == 422 and too_many.json()["error"]["code"] == "insufficient_stock"
    same = await client.post(
        url, headers={**owner.headers, **_key("same")}, json={**TRANSFER, "to_location_id": 2}
    )
    assert same.status_code == 422 and same.json()["error"]["code"] == "same_location"
    flour = await client.post(
        url,
        headers={**owner.headers, **_key("flour")},
        json={**TRANSFER, "item_key": "itm-4", "qty": 5},
    )
    assert flour.status_code == 422 and flour.json()["error"]["code"] == "batch_required"
    short_transporter = await client.post(
        url, headers={**owner.headers, **_key("tr")}, json={**TRANSFER, "transporter": "G"}
    )
    assert short_transporter.status_code == 422
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-1", 2) == 100 and ledger["transfers"] == []


async def test_a_count_books_each_difference_as_an_adjustment(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await _setup(client, mailbox)
    counted = await client.post(
        "/v1/operations/counts",
        headers={**owner.headers, **_key("count-1")},
        json={
            "location_id": 2,
            "lines": [
                {"item_key": "itm-1", "counted": 90},
                {"item_key": "itm-4", "batch_no": "FC-2609-A", "counted": 30},
            ],
        },
    )
    assert counted.status_code == 201, counted.text
    body = counted.json()
    assert body["number"].startswith("CNT-")
    box_line = next(line for line in body["lines"] if line["item_key"] == "itm-1")
    assert box_line["system"] == 100 and box_line["variance"] == -10
    again = await client.post(
        "/v1/operations/counts",
        headers={**owner.headers, **_key("count-1")},
        json={"location_id": 2, "lines": [{"item_key": "itm-1", "counted": 1}]},
    )
    assert again.status_code == 200 and again.json()["id"] == body["id"]

    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    # Ten boxes at 28.00 is 280.00, under the approval line, so it is applied at once.
    assert _on_hand(ledger, "itm-1", 2) == 90
    assert len(ledger["adjustments"]) == 1 and ledger["adjustments"][0]["status"] == "applied"
    assert [c["number"] for c in ledger["counts"]] == [body["number"]]
    async with admin_engine.connect() as admin:
        count_actions = (
            (
                await admin.execute(
                    text("SELECT action FROM audit_log WHERE action = 'operations.count_recorded'")
                )
            )
            .scalars()
            .all()
        )
    assert count_actions == ["operations.count_recorded"]


async def test_a_large_count_difference_waits_for_another_person(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    # Thirty bags at 450.00 is 13,500.00, over the approval line, so the write-off waits.
    counted = await client.post(
        "/v1/operations/counts",
        headers={**owner.headers, **_key("count-big")},
        json={
            "location_id": 2,
            "lines": [{"item_key": "itm-4", "batch_no": "FC-2609-A", "counted": 0}],
        },
    )
    assert counted.status_code == 201, counted.text
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    pending = [a for a in ledger["adjustments"] if a["status"] == "pending"]
    assert len(pending) == 1 and pending[0]["qty"] == -30
    assert _on_hand(ledger, "itm-4", 2, "FC-2609-A") == 30
    approved = await client.post(
        f"/v1/operations/adjustments/{pending[0]['id']}/approve", headers=second
    )
    assert approved.status_code == 200
    ledger = (await client.get("/v1/operations/ledger", headers=owner.headers)).json()
    assert _on_hand(ledger, "itm-4", 2, "FC-2609-A") == 0


async def test_a_count_cannot_repeat_a_line_or_use_an_unknown_batch(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/operations/counts"
    twice = await client.post(
        url,
        headers={**owner.headers, **_key("dup")},
        json={
            "location_id": 2,
            "lines": [{"item_key": "itm-1", "counted": 1}, {"item_key": "itm-1", "counted": 2}],
        },
    )
    assert twice.status_code == 422 and twice.json()["error"]["code"] == "duplicate_line"
    unknown = await client.post(
        url,
        headers={**owner.headers, **_key("unk")},
        json={"location_id": 2, "lines": [{"item_key": "itm-4", "batch_no": "ZZ-9", "counted": 1}]},
    )
    assert unknown.status_code == 422 and unknown.json()["error"]["code"] == "unknown_batch"
    negative = await client.post(
        url,
        headers={**owner.headers, **_key("neg")},
        json={"location_id": 2, "lines": [{"item_key": "itm-1", "counted": -1}]},
    )
    assert negative.status_code == 422


async def test_agents_and_other_companies_cannot_move_or_count_stock(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (
        await client.post(
            "/v1/operations/transfers", headers={**agent, **_key("a-t")}, json=TRANSFER
        )
    ).status_code == 403
    assert (
        await client.post(
            "/v1/operations/counts",
            headers={**agent, **_key("a-c")},
            json={"location_id": 2, "lines": [{"item_key": "itm-1", "counted": 1}]},
        )
    ).status_code == 403
    sent = await client.post(
        "/v1/operations/transfers", headers={**owner.headers, **_key("t-own")}, json=TRANSFER
    )
    other = await signup(client, mailbox, "other@example.com")
    received = await client.post(
        f"/v1/operations/transfers/{sent.json()['id']}/receive", headers=other.headers
    )
    assert received.status_code == 404
