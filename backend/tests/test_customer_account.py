"""A customer's account on their CRM page: invoiced, paid and owed, by who may see money."""

import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup
from tests.test_finance_records import INVOICE, PAYMENT, TOTAL


async def test_customer_account_shows_money_only_to_those_who_handle_it(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    lead = (
        await client.post(
            "/v1/leads",
            headers={**owner.headers, "Idempotency-Key": "kavita"},
            # The company is written differently from the invoice's; it is still the customer.
            json={"name": "Kavita Rao", "phone": "9876500111", "company": "M/s Northstar Retail"},
        )
    ).json()
    url = f"/v1/contacts/{lead['customerId']}/account"
    nothing = (await client.get(url, headers=owner.headers)).json()
    assert nothing == {**nothing, "full": True, "invoices": 0}

    invoice = (
        await client.post(
            "/v1/finance/invoices",
            headers={**owner.headers, "Idempotency-Key": "inv-kavita"},
            json=INVOICE,
        )
    ).json()
    await client.post(
        f"/v1/finance/invoices/{invoice['id']}/payments",
        headers={**owner.headers, "Idempotency-Key": "pay-kavita"},
        json=PAYMENT,
    )
    # Another customer's invoice is not theirs.
    await client.post(
        "/v1/finance/invoices",
        headers={**owner.headers, "Idempotency-Key": "inv-other"},
        json={**INVOICE, "customer": "Ravi", "customer_company": "Ravi Stores"},
    )
    full = (await client.get(url, headers=owner.headers)).json()
    owed = (TOTAL - PAYMENT["amount_paise"]) / 100
    assert full["full"] is True and full["invoices"] == 1
    assert full["invoiced"] == f"{TOTAL / 100:.2f}" and full["paid"] == "30000.00"
    assert full["due"] == f"{owed:.2f}" and full["overdue"] == f"{owed:.2f}"
    assert full["overdueInvoices"] == 1 and full["oldestOverdueDays"] > 0
    assert [item["number"] for item in full["latest"]] == [invoice["number"]]

    # A salesperson who owns the customer learns only that invoices are overdue.
    agent_id = (await client.get("/v1/me", headers=agent)).json()["user"]["id"]
    assigned = await client.post(
        "/v1/leads/assign",
        headers=owner.headers,
        json={"leadIds": [lead["id"]], "ownerId": agent_id},
    )
    assert assigned.status_code == 200, assigned.text
    limited = (await client.get(url, headers=agent)).json()
    assert limited["full"] is False and limited["overdueInvoices"] == 1
    assert limited["invoiced"] is None and limited["due"] is None and limited["latest"] == []

    # Someone in another company cannot see this customer at all.
    stranger = await signup(client, mailbox, "stranger@example.com")
    assert (await client.get(url, headers=stranger.headers)).status_code == 404
