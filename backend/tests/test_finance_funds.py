import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import Account, accept_new, invite, signup

LINE = {
    "external_key": "line-ops",
    "name": "Warehouse operations",
    "owner_name": "Neha Verma",
    "allocated_paise": 1000000,
}
SMALL = {
    "key": "fund-small",
    "purpose": "Packing tape restock",
    "amount_paise": 300000,
    "budget_line_key": "line-ops",
}
LARGE = {
    "key": "fund-large",
    "purpose": "New racking for Manesar",
    "amount_paise": 6000000,
    "budget_line_key": "line-ops",
}


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> tuple[Account, Account, Account]:
    owner = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    third = await accept_new(
        client, await invite(client, mailbox, owner, "third@example.com", role="owner")
    )
    line = await client.post("/v1/finance/budget-lines", headers=owner.headers, json=LINE)
    assert line.status_code == 201, line.text
    return owner, second, third


async def _allocated(client: httpx.AsyncClient, owner: Account) -> int:
    lines = (await client.get("/v1/finance/budget-lines", headers=owner.headers)).json()
    return next(line["allocated_paise"] for line in lines if line["external_key"] == "line-ops")


async def test_a_small_request_is_allocated_once_the_owner_approves(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner, second, _ = await _setup(client, mailbox)
    raised = await client.post(
        "/v1/finance/fund-requests", headers={**owner.headers, **_key("fr-1")}, json=SMALL
    )
    assert raised.status_code == 201, raised.text
    assert raised.json()["number"].startswith("FR-") and raised.json()["status"] == "pending"
    again = await client.post(
        "/v1/finance/fund-requests", headers={**owner.headers, **_key("fr-1")}, json=SMALL
    )
    assert again.status_code == 200 and again.json()["id"] == "fund-small"

    own = await client.post(
        "/v1/finance/fund-requests/fund-small/owner-approve", headers=owner.headers
    )
    assert own.status_code == 403 and own.json()["error"]["code"] == "self_approval"
    approved = await client.post(
        "/v1/finance/fund-requests/fund-small/owner-approve", headers=second
    )
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    assert await _allocated(client, owner) == 1300000
    twice = await client.post("/v1/finance/fund-requests/fund-small/owner-approve", headers=second)
    assert twice.status_code == 409 and twice.json()["error"]["code"] == "not_pending"
    assert await _allocated(client, owner) == 1300000
    async with admin_engine.connect() as admin:
        allocations = (
            await admin.execute(
                text("SELECT count(*) FROM finance_budget_movements WHERE kind = 'allocation'")
            )
        ).scalar_one()
    assert allocations == 1


async def test_a_large_request_needs_the_owner_then_a_different_finance_approver(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, second, third = await _setup(client, mailbox)
    await client.post(
        "/v1/finance/fund-requests", headers={**owner.headers, **_key("fr-2")}, json=LARGE
    )
    owner_step = await client.post(
        "/v1/finance/fund-requests/fund-large/owner-approve", headers=second
    )
    assert owner_step.status_code == 200 and owner_step.json()["status"] == "awaiting_finance"
    assert await _allocated(client, owner) == 1000000
    same = await client.post("/v1/finance/fund-requests/fund-large/finance-approve", headers=second)
    assert same.status_code == 403 and same.json()["error"]["code"] == "same_approver"
    final = await client.post("/v1/finance/fund-requests/fund-large/finance-approve", headers=third)
    assert final.status_code == 200 and final.json()["status"] == "approved"
    assert final.json()["finance_approved_by"] == "Owner" or final.json()["finance_approved_by"]
    assert await _allocated(client, owner) == 7000000


async def test_a_request_can_be_rejected_but_not_once_it_is_approved(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, second, _ = await _setup(client, mailbox)
    await client.post(
        "/v1/finance/fund-requests", headers={**owner.headers, **_key("fr-3")}, json=SMALL
    )
    own = await client.post(
        "/v1/finance/fund-requests/fund-small/reject",
        headers=owner.headers,
        json={"reason": "Not mine"},
    )
    assert own.status_code == 403
    rejected = await client.post(
        "/v1/finance/fund-requests/fund-small/reject",
        headers=second,
        json={"reason": "Wait for the quarter"},
    )
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    late = await client.post("/v1/finance/fund-requests/fund-small/owner-approve", headers=second)
    assert late.status_code == 409
    await client.post(
        "/v1/finance/fund-requests",
        headers={**owner.headers, **_key("fr-4")},
        json={**SMALL, "key": "fund-2"},
    )
    await client.post("/v1/finance/fund-requests/fund-2/owner-approve", headers=second)
    closed = await client.post(
        "/v1/finance/fund-requests/fund-2/reject", headers=second, json={"reason": "Too late"}
    )
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "not_open"


async def test_bad_requests_and_other_roles_are_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, _ = await _setup(client, mailbox)
    unknown = await client.post(
        "/v1/finance/fund-requests",
        headers={**owner.headers, **_key("nope")},
        json={**SMALL, "key": "fund-x", "budget_line_key": "line-missing"},
    )
    assert unknown.status_code == 422 and unknown.json()["error"]["code"] == "budget_line_not_found"
    zero = await client.post(
        "/v1/finance/fund-requests",
        headers={**owner.headers, **_key("zero")},
        json={**SMALL, "key": "fz", "amount_paise": 0},
    )
    assert zero.status_code == 422
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (await client.get("/v1/finance/fund-requests", headers=agent)).status_code == 403
    other = await signup(client, mailbox, "other@example.com")
    assert (await client.get("/v1/finance/fund-requests", headers=other.headers)).json() == []
    await client.post(
        "/v1/finance/fund-requests", headers={**owner.headers, **_key("fr-5")}, json=SMALL
    )
    hidden = await client.post(
        "/v1/finance/fund-requests/fund-small/owner-approve", headers=other.headers
    )
    assert hidden.status_code == 404
