import httpx

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
    "movements": [
        {
            "key": "mv-1",
            "item_key": "itm-1",
            "location_id": 2,
            "qty": 1000,
            "reason": "Opening",
            "booked_on": "2026-10-01",
        }
    ],
    "purchase_orders": [
        {
            "key": "po-1",
            "number": "PO-2026-0101",
            "vendor": "Gurugram Packaging Co",
            "location_id": 2,
            "lines": [{"item_key": "itm-1", "qty": 100, "rate_paise": 4500}],
        }
    ],
}
INVOICE = {
    "customer": "Kavita Rao",
    "customer_company": "Northstar Retail",
    "invoice_date": "2026-10-01",
    "due_date": "2026-10-31",
    "same_state": True,
    "lines": [
        {
            "item": "Festive staples pack",
            "hsn": "1904",
            "qty": 1,
            "rate_paise": 120000,
            "gst_rate": 12,
        }
    ],
}
RULES = {
    "locked_through": None,
    "adjustment_approval_value_paise": 1000000,
    "match_tolerance_percent": 2,
}


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> Account:
    owner = await signup(client, mailbox)
    assert (
        await client.post("/v1/operations/import", headers=owner.headers, json=OPENING)
    ).status_code == 201
    return owner


async def test_rules_default_and_only_the_owner_changes_them(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    assert (await client.get("/v1/company-rules", headers=owner.headers)).json() == RULES
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (await client.get("/v1/company-rules", headers=agent)).status_code == 200
    denied = await client.put("/v1/company-rules", headers=agent, json=RULES)
    assert denied.status_code == 403


async def test_a_locked_period_refuses_money_and_stock_entries_until_reopened(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    locked = await client.put(
        "/v1/company-rules", headers=owner.headers, json={**RULES, "locked_through": "2999-12-31"}
    )
    assert locked.status_code == 200 and locked.json()["locked_through"] == "2999-12-31"
    invoice = await client.post(
        "/v1/finance/invoices", headers={**owner.headers, **_key("inv-lock")}, json=INVOICE
    )
    assert invoice.status_code == 422 and invoice.json()["error"]["code"] == "period_locked"
    receipt = await client.post(
        "/v1/operations/items/itm-1/receipts",
        headers={**owner.headers, **_key("rcv-lock")},
        json={"location_id": 2, "qty": 5},
    )
    assert receipt.status_code == 422 and receipt.json()["error"]["code"] == "period_locked"

    reopened = await client.put("/v1/company-rules", headers=owner.headers, json=RULES)
    assert reopened.status_code == 200 and reopened.json()["locked_through"] is None
    ok = await client.post(
        "/v1/finance/invoices", headers={**owner.headers, **_key("inv-open")}, json=INVOICE
    )
    assert ok.status_code == 201, ok.text


async def test_the_company_approval_value_decides_which_adjustments_wait(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    # Two hundred boxes at 28.00 is 5,600.00: under the default 10,000.00 line, so applied at once.
    applied = await client.post(
        "/v1/operations/items/itm-1/adjustments",
        headers={**owner.headers, **_key("a-default")},
        json={"location_id": 2, "qty": 200, "reason": "Found in audit"},
    )
    assert applied.json()["status"] == "applied"
    lowered = await client.put(
        "/v1/company-rules",
        headers=owner.headers,
        json={**RULES, "adjustment_approval_value_paise": 500000},
    )
    assert lowered.status_code == 200
    waiting = await client.post(
        "/v1/operations/items/itm-1/adjustments",
        headers={**owner.headers, **_key("a-lowered")},
        json={"location_id": 2, "qty": 200, "reason": "Found in audit"},
    )
    assert waiting.json()["status"] == "pending"
    approved = await client.post(
        f"/v1/operations/adjustments/{waiting.json()['id']}/approve", headers=second
    )
    assert approved.status_code == 200


async def test_the_company_match_tolerance_decides_whether_a_bill_matches(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    await client.post(
        "/v1/operations/purchase-orders/po-1/receive",
        headers={**owner.headers, **_key("rcv-po")},
        json={"receipts": [{"item_key": "itm-1", "qty": 40}]},
    )
    bill = {
        "vendor": "Gurugram Packaging Co",
        "vendor_bill_no": "GPC/9",
        "bill_date": "2026-10-15",
        "due_date": "2026-10-30",
        "amount_paise": 183000,
        "po_key": "po-1",
    }
    await client.put(
        "/v1/company-rules", headers=owner.headers, json={**RULES, "match_tolerance_percent": 0}
    )
    strict = await client.post(
        "/v1/finance/bills", headers={**owner.headers, **_key("b-strict")}, json=bill
    )
    assert strict.json()["match"] == "bill above goods received"
    await client.put("/v1/company-rules", headers=owner.headers, json=RULES)
    loose = await client.post(
        "/v1/finance/bills",
        headers={**owner.headers, **_key("b-loose")},
        json={**bill, "vendor_bill_no": "GPC/10"},
    )
    assert loose.json()["match"] == "matched"


async def test_bad_rules_are_refused(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await _setup(client, mailbox)
    too_high = await client.put(
        "/v1/company-rules", headers=owner.headers, json={**RULES, "match_tolerance_percent": 11}
    )
    assert too_high.status_code == 422
    negative = await client.put(
        "/v1/company-rules",
        headers=owner.headers,
        json={**RULES, "adjustment_approval_value_paise": -1},
    )
    assert negative.status_code == 422
