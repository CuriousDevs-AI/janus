import hashlib
import hmac
import json

import httpx
import pytest
from pydantic import SecretStr

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
    assert start["usage"] == {"companies": 2, "logins": 2}
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
    invoices = billed.json()["invoices"]
    assert len(invoices) == 3 and all(item["sample"] for item in invoices)
    assert invoices[0]["status"] == "due" and {item["status"] for item in invoices[1:]} == {"paid"}
    assert invoices[0]["amount"] == "1999.00" and invoices[0]["gst"] == "359.82"
    assert invoices[0]["total"] == "2358.82"
    # A month already invoiced is not invoiced twice.
    again = await client.post(
        "/v1/billing/sample-invoices", headers=owner.headers, json={"months": 3}
    )
    assert len(again.json()["invoices"]) == 3

    # Someone who owns no company sees that the plan is the Owner's, and cannot change it.
    member = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
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
