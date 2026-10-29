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
OPENING = {
    "items": [BOX],
    "batches": [],
    "movements": [],
    "purchase_orders": [
        {
            "key": "po-1",
            "number": "PO-2026-0101",
            "vendor": "Gurugram Packaging Co",
            "location_id": 2,
            "lines": [{"item_key": "itm-1", "qty": 100, "rate_paise": 4500}],
        },
        {
            "key": "po-2",
            "number": "PO-2026-0102",
            "vendor": "Udyog Electricals",
            "location_id": 2,
            "lines": [{"item_key": "itm-1", "qty": 50, "rate_paise": 4500}],
        },
    ],
}
BILL = {
    "vendor": "Gurugram Packaging Co",
    "vendor_bill_no": "GPC/2610/88",
    "bill_date": "2026-10-15",
    "due_date": "2026-10-30",
    "amount_paise": 180000,
    "po_key": "po-1",
}
PAYMENT = {
    "amount_paise": 100000,
    "method": "Bank transfer",
    "reference": "NEFT-55201",
    "paid_on": "2026-10-20",
}


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> Account:
    owner = await signup(client, mailbox)
    assert (
        await client.post("/v1/operations/import", headers=owner.headers, json=OPENING)
    ).status_code == 201
    received = await client.post(
        "/v1/operations/purchase-orders/po-1/receive",
        headers={**owner.headers, **_key("rcv")},
        json={"receipts": [{"item_key": "itm-1", "qty": 40}]},
    )
    assert received.status_code == 200, received.text
    return owner


async def test_a_bill_that_matches_the_goods_is_paid_in_parts_up_to_what_is_owed(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await _setup(client, mailbox)
    created = await client.post(
        "/v1/finance/bills", headers={**owner.headers, **_key("b-1")}, json=BILL
    )
    assert created.status_code == 201, created.text
    bill = created.json()
    assert bill["number"].startswith("BILL-") and bill["match"] == "matched"
    again = await client.post(
        "/v1/finance/bills", headers={**owner.headers, **_key("b-1")}, json=BILL
    )
    assert again.status_code == 200 and again.json()["id"] == bill["id"]

    url = f"/v1/finance/bills/{bill['id']}/payments"
    first = await client.post(url, headers={**owner.headers, **_key("p-1")}, json=PAYMENT)
    assert first.status_code == 201, first.text
    assert first.json()["paid_paise"] == 100000 and first.json()["due_paise"] == 80000
    replay = await client.post(url, headers={**owner.headers, **_key("p-1")}, json=PAYMENT)
    assert replay.status_code == 200 and len(replay.json()["payments"]) == 1
    changed = await client.post(
        url, headers={**owner.headers, **_key("p-1")}, json={**PAYMENT, "amount_paise": 5}
    )
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "idempotency_conflict"
    over = await client.post(
        url, headers={**owner.headers, **_key("p-over")}, json={**PAYMENT, "amount_paise": 80001}
    )
    assert over.status_code == 422 and over.json()["error"]["code"] == "over_payment"
    settled = await client.post(
        url, headers={**owner.headers, **_key("p-2")}, json={**PAYMENT, "amount_paise": 80000}
    )
    assert settled.status_code == 201 and settled.json()["due_paise"] == 0

    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text(
                        "SELECT action FROM audit_log WHERE action LIKE 'finance.bill%' ORDER BY id"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert actions == ["finance.bill_recorded", "finance.bill_paid", "finance.bill_paid"]


async def test_a_bill_that_does_not_match_its_goods_is_held_and_one_without_goods_is_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/finance/bills"
    no_goods = await client.post(
        url,
        headers={**owner.headers, **_key("b-ng")},
        json={**BILL, "po_key": "po-2", "vendor_bill_no": "X-2"},
    )
    assert no_goods.status_code == 422 and no_goods.json()["error"]["code"] == "goods_not_received"
    missing = await client.post(
        url, headers={**owner.headers, **_key("b-na")}, json={**BILL, "po_key": "po-zz"}
    )
    assert missing.status_code == 422 and missing.json()["error"]["code"] == "po_not_found"

    higher = await client.post(
        url,
        headers={**owner.headers, **_key("b-high")},
        json={**BILL, "amount_paise": 250000, "vendor_bill_no": "GPC/2"},
    )
    assert higher.status_code == 201 and higher.json()["match"] == "bill above goods received"
    held = await client.post(
        f"{url}/{higher.json()['id']}/payments",
        headers={**owner.headers, **_key("h-1")},
        json=PAYMENT,
    )
    assert held.status_code == 422 and held.json()["error"]["code"] == "payment_held"

    within = await client.post(
        url,
        headers={**owner.headers, **_key("b-tol")},
        json={**BILL, "amount_paise": 183000, "vendor_bill_no": "GPC/3"},
    )
    assert within.json()["match"] == "matched"


async def test_bad_input_is_refused_and_only_billing_managers_see_bills(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    backwards = await client.post(
        "/v1/finance/bills",
        headers={**owner.headers, **_key("bw")},
        json={**BILL, "due_date": "2026-10-01"},
    )
    assert backwards.status_code == 422 and backwards.json()["error"]["code"] == "due_before_bill"
    created = await client.post(
        "/v1/finance/bills", headers={**owner.headers, **_key("b-ok")}, json=BILL
    )
    url = f"/v1/finance/bills/{created.json()['id']}/payments"
    barter = await client.post(
        url, headers={**owner.headers, **_key("bart")}, json={**PAYMENT, "method": "Barter"}
    )
    assert barter.status_code == 422
    zero = await client.post(
        url, headers={**owner.headers, **_key("zero")}, json={**PAYMENT, "amount_paise": 0}
    )
    assert zero.status_code == 422
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (await client.get("/v1/finance/bills", headers=agent)).status_code == 403
    assert (
        await client.post("/v1/finance/bills", headers={**agent, **_key("ag")}, json=BILL)
    ).status_code == 403


async def test_another_company_cannot_see_or_pay_the_bill(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    created = await client.post(
        "/v1/finance/bills", headers={**owner.headers, **_key("b-iso")}, json=BILL
    )
    other = await signup(client, mailbox, "other@example.com")
    assert (await client.get("/v1/finance/bills", headers=other.headers)).json() == []
    paid = await client.post(
        f"/v1/finance/bills/{created.json()['id']}/payments",
        headers={**other.headers, **_key("steal")},
        json=PAYMENT,
    )
    assert paid.status_code == 404
