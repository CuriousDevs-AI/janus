import hashlib
import hmac
import json
from datetime import date

import httpx
import pytest
from pydantic import SecretStr

from janus_api.billing import change
from janus_api.billing import service as billing
from janus_api.core.config import get_settings
from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


async def test_the_plan_is_the_owners_and_covers_every_company(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    second = await client.post(
        "/v1/portfolio/companies", headers=owner.headers, json={"name": "Pune Retail"}
    )
    assert second.status_code == 201, second.text

    start = (await client.get("/v1/billing", headers=owner.headers)).json()
    assert start["owner"] is True and start["plan"] == "free" and start["startedOn"] is None
    assert [plan["id"] for plan in start["plans"]] == ["free", "startup", "growth", "enterprise"]
    assert start["usage"]["companies"] == 2 and start["usage"]["logins"] == 2
    by_company = start["usage"]["byCompany"]
    assert [(row["people"], row["invited"]) for row in by_company] == [(1, 0), (1, 0)]
    assert by_company[1]["name"] == "Pune Retail"
    assert start["invoices"] == [] and start["canChange"] is True

    # Sample invoices need a paid plan; Enterprise is set up with the team, not here.
    refused = await client.post("/v1/billing/sample-invoices", headers=owner.headers, json={})
    assert refused.status_code == 409
    enterprise = await client.put(
        "/v1/billing/plan", headers=owner.headers, json={"plan": "enterprise"}
    )
    assert enterprise.status_code == 409 and enterprise.json()["error"]["code"] == "contact_sales"

    moved = await client.put("/v1/billing/plan", headers=owner.headers, json={"plan": "startup"})
    assert moved.status_code == 200, moved.text
    assert moved.json()["plan"] == "startup" and moved.json()["renewsOn"] is not None

    billed = await client.post(
        "/v1/billing/sample-invoices", headers=owner.headers, json={"months": 3}
    )
    assert billed.status_code == 200, billed.text
    # The move itself recorded today's month, paid, as a sample; then three monthly ones, the
    # newest of which is still due.
    invoices = billed.json()["invoices"]
    assert len(invoices) == 4 and all(item["sample"] for item in invoices)
    assert (
        invoices[0]["status"] == "paid" and invoices[0]["periodStart"] == moved.json()["startedOn"]
    )
    monthly = invoices[1:]
    assert monthly[0]["status"] == "due" and {item["status"] for item in monthly[1:]} == {"paid"}
    assert monthly[0]["amount"] == "1999.00" and monthly[0]["gst"] == "359.82"
    assert monthly[0]["total"] == "2358.82"
    # A month already invoiced is not invoiced twice.
    again = await client.post(
        "/v1/billing/sample-invoices", headers=owner.headers, json={"months": 3}
    )
    assert len(again.json()["invoices"]) == 4

    # Someone who owns no company sees that the plan is the Owner's, and cannot change it.
    member = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    await invite(client, mailbox, owner, "waiting@example.com")
    usage = (await client.get("/v1/billing", headers=owner.headers)).json()["usage"]
    first = usage["byCompany"][0]
    assert (first["people"], first["invited"]) == (2, 1) and usage["logins"] == 4
    theirs = (await client.get("/v1/billing", headers=member)).json()
    assert theirs["owner"] is False and theirs["invoices"] == [] and theirs["canChange"] is False
    assert (
        await client.put("/v1/billing/plan", headers=member, json={"plan": "growth"})
    ).status_code == 403
    downgraded = await client.put("/v1/billing/plan", headers=owner.headers, json={"plan": "free"})
    assert downgraded.json()["plan"] == "free" and downgraded.json()["renewsOn"] is None


async def test_production_cannot_change_the_plan_or_make_sample_invoices(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = await signup(client, mailbox)
    monkeypatch.setattr(get_settings(), "environment", "production")
    view = (await client.get("/v1/billing", headers=owner.headers)).json()
    assert view["canChange"] is False
    changed = await client.put("/v1/billing/plan", headers=owner.headers, json={"plan": "startup"})
    assert (
        changed.status_code == 409 and changed.json()["error"]["code"] == "payments_not_connected"
    )
    sample = await client.post("/v1/billing/sample-invoices", headers=owner.headers, json={})
    assert sample.status_code == 404


async def test_the_plan_limits_companies_and_people(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "plan_limits", True)
    owner = await signup(client, mailbox)
    # Free: one company, three people. The Owner is the first person.
    second = await client.post(
        "/v1/portfolio/companies", headers=owner.headers, json={"name": "Pune Retail"}
    )
    assert second.status_code == 409 and second.json()["error"]["code"] == "plan_limit"
    assert "Startup" in second.json()["error"]["message"]

    # An admin is limited by the Owner's plan too, though they may not read it.
    admin = await accept_new(
        client, await invite(client, mailbox, owner, "admin@example.com", "admin")
    )
    third = await client.post(
        "/v1/invitations", headers=admin, json={"email": "third@example.com", "role": "agent"}
    )
    assert third.status_code in (200, 201), third.text
    full = await client.post(
        "/v1/invitations", headers=admin, json={"email": "fourth@example.com", "role": "agent"}
    )
    assert full.status_code == 409 and full.json()["error"]["code"] == "plan_limit"

    upgraded = await client.put("/v1/billing/plan", headers=owner.headers, json={"plan": "startup"})
    assert upgraded.status_code == 200
    assert (
        await client.post(
            "/v1/invitations", headers=admin, json={"email": "fourth@example.com", "role": "agent"}
        )
    ).status_code in (200, 201)
    assert (
        await client.post(
            "/v1/portfolio/companies", headers=owner.headers, json={"name": "Pune Retail"}
        )
    ).status_code == 201


async def test_a_paid_plan_is_bought_through_razorpay(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(settings, "razorpay_key_secret", SecretStr("key-secret"))
    monkeypatch.setattr(settings, "razorpay_webhook_secret", SecretStr("hook-secret"))
    orders = iter(["order_A1", "order_B2"])
    made: list[tuple[int, dict[str, str]]] = []

    async def fake_order(amount: int, receipt: str, notes: dict[str, str]) -> str:
        made.append((amount, notes))
        return next(orders)

    monkeypatch.setattr(billing, "_create_order", fake_order)
    owner = await signup(client, mailbox)
    assert (await client.get("/v1/billing", headers=owner.headers)).json()["payments"] == "razorpay"

    order = await client.post(
        "/v1/billing/checkout", headers=owner.headers, json={"plan": "startup"}
    )
    assert order.status_code == 200, order.text
    body = order.json()
    assert body["keyId"] == "rzp_test_key" and body["orderId"] == "order_A1"
    assert body["amount"] == 235882 and made[0][0] == 235882 and made[0][1]["plan"] == "startup"
    assert "secret" not in order.text

    def sign(message: str, secret: str) -> str:
        return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()

    forged = await client.post(
        "/v1/billing/checkout/verify",
        headers=owner.headers,
        json={"orderId": "order_A1", "paymentId": "pay_1", "signature": "0" * 64},
    )
    assert forged.status_code == 400
    assert (await client.get("/v1/billing", headers=owner.headers)).json()["plan"] == "free"

    paid = await client.post(
        "/v1/billing/checkout/verify",
        headers=owner.headers,
        json={
            "orderId": "order_A1",
            "paymentId": "pay_1",
            "signature": sign("order_A1|pay_1", "key-secret"),
        },
    )
    assert paid.status_code == 200, paid.text
    view = paid.json()
    assert view["plan"] == "startup" and view["renewsOn"] is not None
    invoice = view["invoices"][0]
    assert invoice["sample"] is False and invoice["status"] == "paid"
    assert invoice["total"] == "2358.82" and invoice["gst"] == "359.82"

    # The webhook for a second order settles it once, however often Razorpay sends it.
    second = await client.post(
        "/v1/billing/checkout", headers=owner.headers, json={"plan": "growth"}
    )
    assert second.json()["orderId"] == "order_B2"
    event = json.dumps(
        {
            "event": "payment.captured",
            "payload": {
                "payment": {"entity": {"id": "pay_2", "order_id": "order_B2", "amount": 707882}}
            },
        }
    )
    unsigned = await client.post(
        "/v1/billing/razorpay/webhook",
        content=event,
        headers={"X-Razorpay-Signature": "wrong", "Content-Type": "application/json"},
    )
    assert unsigned.status_code == 400
    for _ in range(2):
        hook = await client.post(
            "/v1/billing/razorpay/webhook",
            content=event,
            headers={
                "X-Razorpay-Signature": sign(event, "hook-secret"),
                "Content-Type": "application/json",
            },
        )
        assert hook.status_code == 204, hook.text
    after = (await client.get("/v1/billing", headers=owner.headers)).json()
    assert after["plan"] == "growth"
    assert [item["plan"] for item in after["invoices"] if not item["sample"]].count("Growth") == 1

    # Someone else cannot confirm the Owner's order.
    member = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    stolen = await client.post(
        "/v1/billing/checkout/verify",
        headers=member,
        json={
            "orderId": "order_A1",
            "paymentId": "pay_1",
            "signature": sign("order_A1|pay_1", "key-secret"),
        },
    )
    assert stolen.status_code == 404


async def test_moving_down_archives_what_does_not_fit_and_refunds_the_unused_days(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(settings, "razorpay_key_secret", SecretStr("key-secret"))
    refunds: list[tuple[str, int]] = []

    async def fake_order(amount: int, receipt: str, notes: dict[str, str]) -> str:
        return "order_G1"

    async def fake_refund(payment_id: str, paise: int) -> str:
        refunds.append((payment_id, paise))
        return "rfnd_1"

    monkeypatch.setattr(billing, "_create_order", fake_order)
    monkeypatch.setattr(change, "_refund_payment", fake_refund)
    owner = await signup(client, mailbox)
    for name in ("Pune Retail", "Surat Exports"):
        added = await client.post(
            "/v1/portfolio/companies", headers=owner.headers, json={"name": name}
        )
        assert added.status_code == 201, added.text
    members = [
        await accept_new(client, await invite(client, mailbox, owner, f"m{n}@example.com"))
        for n in range(3)
    ]
    await invite(client, mailbox, owner, "late@example.com")

    # Growth, bought through Razorpay, so this month is a paid invoice with its payment.
    await client.post("/v1/billing/checkout", headers=owner.headers, json={"plan": "growth"})
    signature = hmac.new(b"key-secret", b"order_G1|pay_G1", hashlib.sha256).hexdigest()
    paid = await client.post(
        "/v1/billing/checkout/verify",
        headers=owner.headers,
        json={"orderId": "order_G1", "paymentId": "pay_G1", "signature": signature},
    )
    assert paid.status_code == 200, paid.text
    invoice = paid.json()["invoices"][0]
    period = (
        date.fromisoformat(invoice["periodEnd"]) - date.fromisoformat(invoice["periodStart"])
    ).days + 1

    # Free holds one company and three people: the session's company stays, and choosing another
    # as well is too many.
    other = next(
        item["id"]
        for item in (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()[
            "companies"
        ]
        if item["name"] == "Pune Retail"
    )
    too_many = await client.get(
        f"/v1/billing/preview?plan=free&keep={other}", headers=owner.headers
    )
    assert too_many.status_code == 422
    # A CA shared only Pune Retail loses it with the company, and the popup says so by name.
    shared = await client.post(
        "/v1/portfolio/access",
        headers=owner.headers,
        json={"email": "ca@example.com", "role": "group_analyst", "companies": [other]},
    )
    assert shared.status_code in (200, 201), shared.text
    await client.post(
        f"/v1/invitations/{mailbox.token('ca@example.com', 'invite')}/accept",
        json={"name": "Mehta and Co", "password": "Correct-Horse-9!"},
    )
    seen = (await client.get("/v1/billing/preview?plan=free", headers=owner.headers)).json()
    assert [item["name"] for item in seen["archiveCompanies"]] == ["Pune Retail", "Surat Exports"]
    assert seen["loseAccess"] == [{"name": "Mehta and Co", "company": "Pune Retail"}]
    assert [item["name"] for item in seen["withdrawInvitations"]] == ["late@example.com"]
    # Owner, three members and an invitation are five seats: the invitation goes, then one member.
    assert len(seen["archivePeople"]) == 1
    refund = seen["refund"]
    assert refund["method"] == "razorpay" and refund["daysUsed"] == 1
    assert refund["daysTotal"] == period and refund["daysUnused"] == period - 1
    expected = 707882 * (period - 1) // period
    assert refund["amount"] == f"{expected / 100:.2f}"

    moved = await client.put("/v1/billing/plan", headers=owner.headers, json={"plan": "free"})
    assert moved.status_code == 200, moved.text
    after = moved.json()
    assert after["plan"] == "free"
    assert [item["name"] for item in after["archived"]] == ["Pune Retail", "Surat Exports"]
    assert (
        after["refunds"][0]["status"] == "refunded"
        and after["refunds"][0]["amount"] == refund["amount"]
    )
    assert refunds == [("pay_G1", expected)]
    summary = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()
    assert len(summary["companies"]) == 1 and summary["companies"][0]["current"] is True
    # The newest member is archived and can no longer get in; the others can.
    assert (await client.get("/v1/me", headers=members[2])).status_code == 403
    assert (await client.get("/v1/me", headers=members[0])).status_code == 200

    # Moving up again brings back the companies and the member; nothing was lost.
    back = await client.put("/v1/billing/plan", headers=owner.headers, json={"plan": "growth"})
    assert back.json()["archived"] == []
    assert (
        len((await client.get("/v1/portfolio/summary", headers=owner.headers)).json()["companies"])
        == 3
    )
    assert (await client.get("/v1/me", headers=members[2])).status_code == 200


async def test_invoices_carry_both_gstins_the_sac_and_the_place_of_supply(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "janus_gstin", "29AAACJ1234K1Z5")
    monkeypatch.setattr(settings, "janus_state_code", "29")
    owner = await signup(client, mailbox)
    await client.put("/v1/billing/plan", headers=owner.headers, json={"plan": "growth"})
    await client.post("/v1/billing/sample-invoices", headers=owner.headers, json={"months": 1})
    before = (await client.get("/v1/billing", headers=owner.headers)).json()
    # A sample month never bills days an invoice already covers.
    spans = sorted((item["periodStart"], item["periodEnd"]) for item in before["invoices"])
    assert all(end < start for (_, end), (start, _) in zip(spans, spans[1:], strict=False))
    assert before["billTo"] is None and before["seller"]["gstin"] == "29AAACJ1234K1Z5"
    assert before["seller"]["sac"] and before["invoices"][0]["igst"] is None

    bad = await client.put(
        "/v1/billing/details",
        headers=owner.headers,
        json={"legalName": "Malhotra Textiles Pvt Ltd", "gstin": "27BAD", "stateCode": "27"},
    )
    assert bad.status_code == 422
    # The GSTIN decides the state: Maharashtra, another state than Janus's, so IGST.
    saved = await client.put(
        "/v1/billing/details",
        headers=owner.headers,
        json={
            "legalName": "Malhotra Textiles Pvt Ltd",
            "gstin": "27AAPFU0939F1ZV",
            "stateCode": "29",
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["billTo"]["stateCode"] == "27" and body["billTo"]["gstin"] == "27AAPFU0939F1ZV"
    invoice = body["invoices"][0]
    assert invoice["igst"] == invoice["gst"] and invoice["cgst"] is None

    # Within Janus's state, the GST is split into CGST and SGST.
    local = await client.put(
        "/v1/billing/details",
        headers=owner.headers,
        json={"legalName": "Malhotra Textiles Pvt Ltd", "stateCode": "29"},
    )
    invoice = local.json()["invoices"][0]
    assert invoice["igst"] is None
    assert float(invoice["cgst"]) + float(invoice["sgst"]) == float(invoice["gst"])

    # Only an Owner keeps the account's billing details.
    member = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    refused = await client.put(
        "/v1/billing/details",
        headers=member,
        json={"legalName": "Someone Else", "stateCode": "29"},
    )
    assert refused.status_code == 403
