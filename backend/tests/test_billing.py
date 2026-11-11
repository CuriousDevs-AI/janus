import httpx
import pytest

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
