import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import Account, accept_new, invite, signup

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
            "qty": 40,
            "rate_paise": 120000,
            "gst_rate": 12,
        },
        {"item": "Gift hamper", "hsn": "2106", "qty": 10, "rate_paise": 240000, "gst_rate": 18},
    ],
}
# Taxable 72,000.00; CGST and SGST 5,040.00 each; total 82,080.00 (in paise).
TOTAL = 8208000
PAYMENT = {
    "amount_paise": 3000000,
    "method": "UPI",
    "reference": "UPI-88213",
    "paid_on": "2026-10-10",
}


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _invoice(client: httpx.AsyncClient, owner: Account, key: str = "inv-1") -> dict:
    created = await client.post(
        "/v1/finance/invoices", headers={**owner.headers, **_key(key)}, json=INVOICE
    )
    assert created.status_code == 201, created.text
    return created.json()


async def test_invoice_totals_are_worked_out_on_the_server(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    body = await _invoice(client, owner)
    assert body["number"] == "INV-2026-0101"
    assert body["taxable_paise"] == 7200000
    assert body["cgst_paise"] == 504000 and body["sgst_paise"] == 504000
    assert body["igst_paise"] == 0
    assert body["total_paise"] == TOTAL and body["due_paise"] == TOTAL

    again = await client.post(
        "/v1/finance/invoices", headers={**owner.headers, **_key("inv-1")}, json=INVOICE
    )
    assert again.status_code == 200 and again.json()["id"] == body["id"]
    listed = (await client.get("/v1/finance/invoices", headers=owner.headers)).json()
    assert len(listed) == 1

    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text("SELECT action FROM audit_log WHERE action LIKE 'finance.invoice%'")
                )
            )
            .scalars()
            .all()
        )
    assert actions == ["finance.invoice_created"]


async def test_other_state_invoices_charge_igst(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    other_state = {**INVOICE, "same_state": False}
    created = await client.post(
        "/v1/finance/invoices", headers={**owner.headers, **_key("inv-igst")}, json=other_state
    )
    assert created.status_code == 201
    assert created.json()["igst_paise"] == 1008000
    assert created.json()["cgst_paise"] == 0 and created.json()["sgst_paise"] == 0


async def test_payments_reduce_what_is_due_and_a_retry_books_once(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    invoice = await _invoice(client, owner)
    url = f"/v1/finance/invoices/{invoice['id']}/payments"
    first = await client.post(url, headers={**owner.headers, **_key("pay-1")}, json=PAYMENT)
    again = await client.post(url, headers={**owner.headers, **_key("pay-1")}, json=PAYMENT)
    assert first.status_code == 201, first.text
    assert again.status_code == 200
    assert first.json()["paid_paise"] == 3000000
    assert first.json()["due_paise"] == TOTAL - 3000000
    assert len(first.json()["payments"]) == 1

    changed = await client.post(
        url, headers={**owner.headers, **_key("pay-1")}, json={**PAYMENT, "amount_paise": 1}
    )
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "idempotency_conflict"


async def test_a_payment_more_than_is_due_is_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    invoice = await _invoice(client, owner)
    url = f"/v1/finance/invoices/{invoice['id']}/payments"
    over = await client.post(
        url, headers={**owner.headers, **_key("over")}, json={**PAYMENT, "amount_paise": TOTAL + 1}
    )
    assert over.status_code == 422 and over.json()["error"]["code"] == "over_payment"
    exact = await client.post(
        url, headers={**owner.headers, **_key("exact")}, json={**PAYMENT, "amount_paise": TOTAL}
    )
    assert exact.status_code == 201 and exact.json()["due_paise"] == 0


async def test_credit_notes_need_another_approver_and_pending_notes_reduce_what_is_due(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    invoice = await _invoice(client, owner)
    url = f"/v1/finance/invoices/{invoice['id']}/credit-notes"
    note_body = {
        "amount_paise": 1000000,
        "kind": "credit",
        "reason": "Two cartons damaged",
        "noted_on": "2026-10-12",
    }
    raised = await client.post(url, headers={**owner.headers, **_key("cn-1")}, json=note_body)
    assert raised.status_code == 201, raised.text
    assert raised.json()["due_paise"] == TOTAL - 1000000
    note = raised.json()["credit_notes"][0]
    assert note["number"] == "CN-2026-0101" and note["status"] == "pending"

    own = await client.post(f"/v1/finance/credit-notes/{note['id']}/approve", headers=owner.headers)
    assert own.status_code == 403 and own.json()["error"]["code"] == "self_approval"

    approved = await client.post(f"/v1/finance/credit-notes/{note['id']}/approve", headers=second)
    assert approved.status_code == 200
    assert approved.json()["credit_notes"][0]["approved_by"]
    again = await client.post(f"/v1/finance/credit-notes/{note['id']}/approve", headers=second)
    assert again.status_code == 409 and again.json()["error"]["code"] == "not_pending"


async def test_a_credit_note_can_be_rejected_with_a_reason(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    invoice = await _invoice(client, owner)
    url = f"/v1/finance/invoices/{invoice['id']}/credit-notes"
    raised = await client.post(
        url,
        headers={**owner.headers, **_key("wo-1")},
        json={
            "amount_paise": 500000,
            "kind": "write-off",
            "reason": "Customer closed",
            "noted_on": "2026-10-12",
        },
    )
    assert raised.status_code == 201
    note = raised.json()["credit_notes"][0]
    assert note["number"] == "WO-2026-0101"
    no_reason = await client.post(
        f"/v1/finance/credit-notes/{note['id']}/reject", headers=second, json={"reason": "no"}
    )
    assert no_reason.status_code == 422
    rejected = await client.post(
        f"/v1/finance/credit-notes/{note['id']}/reject",
        headers=second,
        json={"reason": "Customer has not closed the account"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["credit_notes"][0]["status"] == "rejected"
    assert rejected.json()["due_paise"] == TOTAL


async def test_credit_notes_and_write_offs_cannot_go_past_the_amount_owed(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    invoice = await _invoice(client, owner)
    url = f"/v1/finance/invoices/{invoice['id']}/credit-notes"
    too_much = await client.post(
        url,
        headers={**owner.headers, **_key("big")},
        json={
            "amount_paise": TOTAL + 1,
            "kind": "credit",
            "reason": "Too much",
            "noted_on": "2026-10-12",
        },
    )
    assert too_much.status_code == 422 and too_much.json()["error"]["code"] == "over_credit"
    write_off = await client.post(
        url,
        headers={**owner.headers, **_key("wo-big")},
        json={
            "amount_paise": TOTAL + 1,
            "kind": "write-off",
            "reason": "Gone",
            "noted_on": "2026-10-12",
        },
    )
    assert write_off.status_code == 422 and write_off.json()["error"]["code"] == "over_write_off"


async def test_only_billing_managers_see_or_move_invoices(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    invoice = await _invoice(client, owner)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (await client.get("/v1/finance/invoices", headers=agent)).status_code == 403
    denied = await client.post(
        f"/v1/finance/invoices/{invoice['id']}/payments",
        headers={**agent, **_key("agent-pay")},
        json=PAYMENT,
    )
    assert denied.status_code == 403


async def test_invalid_money_and_missing_keys_are_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    invoice = await _invoice(client, owner)
    bad_dates = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, **_key("dates")},
        json={**INVOICE, "due_date": "2026-09-01"},
    )
    assert (
        bad_dates.status_code == 422 and bad_dates.json()["error"]["code"] == "due_before_invoice"
    )
    bad_gst = await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, **_key("gst")},
        json={**INVOICE, "lines": [{**INVOICE["lines"][0], "gst_rate": 30}]},
    )
    assert bad_gst.status_code == 422
    no_key = await client.post("/v1/finance/invoices", headers=owner.headers, json=INVOICE)
    assert no_key.status_code == 422
    fractional = await client.post(
        f"/v1/finance/invoices/{invoice['id']}/payments",
        headers={**owner.headers, **_key("frac")},
        json={**PAYMENT, "amount_paise": 10.5},
    )
    assert fractional.status_code == 422
    barter = await client.post(
        f"/v1/finance/invoices/{invoice['id']}/payments",
        headers={**owner.headers, **_key("barter")},
        json={**PAYMENT, "method": "Barter"},
    )
    assert barter.status_code == 422
    listed = (await client.get("/v1/finance/invoices", headers=owner.headers)).json()
    assert listed[0]["paid_paise"] == 0


async def test_another_company_cannot_see_or_pay_the_invoice(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    invoice = await _invoice(client, owner)
    other = await signup(client, mailbox, "other@example.com")
    assert (await client.get("/v1/finance/invoices", headers=other.headers)).json() == []
    paid = await client.post(
        f"/v1/finance/invoices/{invoice['id']}/payments",
        headers={**other.headers, **_key("steal")},
        json=PAYMENT,
    )
    assert paid.status_code == 404
    listed = (await client.get("/v1/finance/invoices", headers=owner.headers)).json()
    assert listed[0]["paid_paise"] == 0
