import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import Account, accept_new, invite, signup

LINE = {
    "external_key": "line-sales",
    "name": "Sales and marketing",
    "owner_name": "Arjun Mehta",
    "allocated_paise": 30000000,
}
DRAW = {"amount_paise": 4000000, "note": "Diwali campaign", "booked_on": "2026-10-20"}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> Account:
    owner = await signup(client, mailbox)
    created = await client.post("/v1/finance/budget-lines", headers=owner.headers, json=LINE)
    assert created.status_code == 201, created.text
    return owner


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def test_draw_and_release_move_the_server_balance(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await _setup(client, mailbox)
    drawn = await client.post(
        "/v1/finance/budget-lines/line-sales/draws",
        headers={**owner.headers, **_key("draw-1")},
        json=DRAW,
    )
    assert drawn.status_code == 201, drawn.text
    body = drawn.json()
    assert body["amount_paise"] == 4000000
    assert body["budget"]["drawn_paise"] == 4000000
    assert body["budget"]["remaining_paise"] == 26000000

    released = await client.post(
        "/v1/finance/budget-lines/line-sales/releases",
        headers={**owner.headers, **_key("release-1")},
        json={"amount_paise": 1000000, "note": "Campaign came in under", "booked_on": "2026-10-21"},
    )
    assert released.status_code == 201, released.text
    assert released.json()["amount_paise"] == -1000000
    assert released.json()["budget"]["drawn_paise"] == 3000000

    listed = (await client.get("/v1/finance/budget-lines", headers=owner.headers)).json()
    assert listed[0]["remaining_paise"] == 27000000

    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text(
                        "SELECT action FROM audit_log "
                        "WHERE action LIKE 'finance.budget_%' ORDER BY id"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert actions == [
        "finance.budget_line_created",
        "finance.budget_draw",
        "finance.budget_release",
    ]


async def test_only_billing_managers_can_move_money(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    denied = await client.post(
        "/v1/finance/budget-lines/line-sales/draws",
        headers={**agent, **_key("draw-agent")},
        json=DRAW,
    )
    assert denied.status_code == 403
    listed = await client.get("/v1/finance/budget-lines", headers=agent)
    assert listed.status_code == 403


async def test_invalid_money_is_refused_before_anything_moves(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/finance/budget-lines/line-sales/draws"
    zero = await client.post(
        url, headers={**owner.headers, **_key("zero")}, json={**DRAW, "amount_paise": 0}
    )
    assert zero.status_code == 422
    fractional = await client.post(
        url, headers={**owner.headers, **_key("frac")}, json={**DRAW, "amount_paise": 1.5}
    )
    assert fractional.status_code == 422
    no_key = await client.post(url, headers=owner.headers, json=DRAW)
    assert no_key.status_code == 422

    too_much = await client.post(
        url,
        headers={**owner.headers, **_key("too-much")},
        json={**DRAW, "amount_paise": 30000001},
    )
    assert too_much.status_code == 422
    assert too_much.json()["error"]["code"] == "insufficient_budget"

    over_release = await client.post(
        "/v1/finance/budget-lines/line-sales/releases",
        headers={**owner.headers, **_key("over-release")},
        json={**DRAW, "amount_paise": 1},
    )
    assert over_release.status_code == 422
    assert over_release.json()["error"]["code"] == "insufficient_drawn"

    listed = (await client.get("/v1/finance/budget-lines", headers=owner.headers)).json()
    assert listed[0]["drawn_paise"] == 0


async def test_a_retried_draw_is_booked_once(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/finance/budget-lines/line-sales/draws"
    first = await client.post(url, headers={**owner.headers, **_key("retry-1")}, json=DRAW)
    again = await client.post(url, headers={**owner.headers, **_key("retry-1")}, json=DRAW)
    assert first.status_code == 201
    assert again.status_code == 200
    assert again.json()["id"] == first.json()["id"]

    listed = (await client.get("/v1/finance/budget-lines", headers=owner.headers)).json()
    assert listed[0]["drawn_paise"] == 4000000

    changed = await client.post(
        url,
        headers={**owner.headers, **_key("retry-1")},
        json={**DRAW, "amount_paise": 5000000},
    )
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "idempotency_conflict"


async def test_another_company_cannot_see_or_move_the_line(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    other = await signup(client, mailbox, "other@example.com")
    assert (await client.get("/v1/finance/budget-lines", headers=other.headers)).json() == []
    moved = await client.post(
        "/v1/finance/budget-lines/line-sales/draws",
        headers={**other.headers, **_key("steal")},
        json=DRAW,
    )
    assert moved.status_code == 404
    listed = (await client.get("/v1/finance/budget-lines", headers=owner.headers)).json()
    assert listed[0]["drawn_paise"] == 0


async def test_duplicate_line_key_is_refused(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await _setup(client, mailbox)
    again = await client.post("/v1/finance/budget-lines", headers=owner.headers, json=LINE)
    assert again.status_code == 409


async def test_an_approved_request_allocates_money_once(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    url = "/v1/finance/budget-lines/line-sales/allocations"
    body = {"amount_paise": 2500000, "note": "Fund request FR-2026-0007", "booked_on": "2026-10-23"}
    first = await client.post(url, headers={**owner.headers, **_key("fund:FR-7")}, json=body)
    again = await client.post(url, headers={**owner.headers, **_key("fund:FR-7")}, json=body)
    assert first.status_code == 201, first.text
    assert again.status_code == 200 and again.json()["id"] == first.json()["id"]
    budget = first.json()["budget"]
    assert budget["allocated_paise"] == 30000000 + 2500000
    assert budget["drawn_paise"] == 0

    mismatched = await client.post(
        url,
        headers={**owner.headers, **_key("fund:FR-7")},
        json={**body, "amount_paise": 100},
    )
    assert mismatched.status_code == 409


async def test_only_billing_managers_can_allocate(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    denied = await client.post(
        "/v1/finance/budget-lines/line-sales/allocations",
        headers={**agent, **_key("fund:agent")},
        json={"amount_paise": 100, "note": "Not allowed", "booked_on": "2026-10-23"},
    )
    assert denied.status_code == 403
