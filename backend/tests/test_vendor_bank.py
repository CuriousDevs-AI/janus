import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

ACCOUNT = "123456789012"
REQUEST = {
    "vendor_id": "ven-1",
    "vendor_name": "Gurugram Packaging Co",
    "holder": "Gurugram Packaging Co",
    "account": ACCOUNT,
    "ifsc": "HDFC0001234",
}


async def test_full_number_is_encrypted_and_never_returned(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    created = await client.post("/v1/vendor-bank-accounts", headers=owner.headers, json=REQUEST)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["masked_account"] == "••••9012" and body["status"] == "pending"
    assert ACCOUNT not in created.text

    listed = await client.get("/v1/vendor-bank-accounts", headers=owner.headers)
    assert listed.status_code == 200
    assert ACCOUNT not in listed.text

    async with admin_engine.connect() as admin:
        stored = (
            await admin.execute(text("SELECT account_ciphertext FROM vendor_bank_accounts"))
        ).scalar_one()
    assert ACCOUNT not in stored and stored.startswith("gAAAA")


async def test_requester_cannot_approve_and_another_owner_can(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    request_id = (
        await client.post("/v1/vendor-bank-accounts", headers=owner.headers, json=REQUEST)
    ).json()["id"]

    own = await client.post(
        f"/v1/vendor-bank-accounts/{request_id}/approve", headers=owner.headers
    )
    assert own.status_code == 403
    assert own.json()["error"]["code"] == "self_approval"

    approved = await client.post(
        f"/v1/vendor-bank-accounts/{request_id}/approve", headers=second
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["approved_by"] == "Member"

    again = await client.post(f"/v1/vendor-bank-accounts/{request_id}/approve", headers=second)
    assert again.status_code == 409

    async with admin_engine.connect() as admin:
        actions = (
            await admin.execute(
                text("SELECT action FROM audit_log WHERE action LIKE 'vendor_bank.%' ORDER BY id")
            )
        ).scalars().all()
    assert actions == ["vendor_bank.requested", "vendor_bank.approved"]


async def test_reject_and_one_pending_change_per_vendor(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    first = await client.post("/v1/vendor-bank-accounts", headers=owner.headers, json=REQUEST)
    assert first.status_code == 201
    duplicate = await client.post("/v1/vendor-bank-accounts", headers=owner.headers, json=REQUEST)
    assert duplicate.status_code == 409
    rejected = await client.post(
        f"/v1/vendor-bank-accounts/{first.json()['id']}/reject",
        headers=second,
        json={"reason": "Account name does not match the vendor"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    fresh = await client.post("/v1/vendor-bank-accounts", headers=owner.headers, json=REQUEST)
    assert fresh.status_code == 201


async def test_bad_details_and_members_without_billing_are_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (
        await client.post("/v1/vendor-bank-accounts", headers=agent, json=REQUEST)
    ).status_code == 403
    bad_ifsc = await client.post(
        "/v1/vendor-bank-accounts", headers=owner.headers, json={**REQUEST, "ifsc": "HDFC123"}
    )
    assert bad_ifsc.status_code == 422
    bad_account = await client.post(
        "/v1/vendor-bank-accounts", headers=owner.headers, json={**REQUEST, "account": "12ab"}
    )
    assert bad_account.status_code == 422
