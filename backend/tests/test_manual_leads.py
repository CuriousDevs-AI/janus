import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def test_a_typed_in_lead_is_owned_by_its_author_and_listed(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    body = {
        "name": "Asha Traders",
        "company": "Asha Traders Pvt Ltd",
        "phone": "9876543210",
        "email": "asha@example.com",
        "requirement": "Bulk order of 40 cartons",
        "source": "manual",
    }
    created = await client.post("/v1/leads", headers={**owner.headers, **_key("lead-1")}, json=body)
    assert created.status_code == 201, created.text
    lead = created.json()
    assert lead["source"] == "manual" and lead["ownerId"] is not None
    assert lead["contactName"] == "Asha Traders" and lead["email"] == "asha@example.com"

    listed = (await client.get("/v1/leads", headers=owner.headers)).json()
    assert [item["id"] for item in listed] == [lead["id"]]


async def test_a_retry_with_the_same_key_returns_the_same_lead(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    body = {"name": "Ravi", "phone": "9123456780"}
    first = await client.post("/v1/leads", headers={**owner.headers, **_key("retry-1")}, json=body)
    again = await client.post("/v1/leads", headers={**owner.headers, **_key("retry-1")}, json=body)
    assert first.status_code == 201 and again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    listed = (await client.get("/v1/leads", headers=owner.headers)).json()
    assert len(listed) == 1


async def test_a_lead_needs_a_way_to_reach_the_person(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    response = await client.post(
        "/v1/leads", headers={**owner.headers, **_key("no-contact")}, json={"name": "No contact"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_lead"


async def test_an_agent_can_add_a_lead_and_the_same_phone_is_not_taken_twice(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    first = await client.post(
        "/v1/leads",
        headers={**agent, **_key("agent-1")},
        json={"name": "Meera", "phone": "9000000001"},
    )
    assert first.status_code == 201, first.text
    second = await client.post(
        "/v1/leads",
        headers={**owner.headers, **_key("owner-1")},
        json={"name": "Someone else", "phone": "9000000001"},
    )
    # The same phone joins the existing contact as a new lead, as webhook captures do.
    assert second.status_code == 201, second.text
    assert second.json()["customerId"] == first.json()["customerId"]


async def test_the_sources_list_leaves_out_the_manual_entry_connection(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    body = {"name": "Asha Traders", "phone": "9876543210", "source": "manual"}
    created = await client.post(
        "/v1/leads", headers={**owner.headers, **_key("lead-src")}, json=body
    )
    assert created.status_code == 201, created.text

    listed = await client.get("/v1/sources", headers=owner.headers)
    assert listed.status_code == 200, listed.text
    assert listed.json() == []


async def test_a_lead_with_a_bad_mobile_number_says_what_to_enter(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    response = await client.post(
        "/v1/leads",
        headers={**owner.headers, **_key("bad-phone")},
        json={"name": "Bad phone", "phone": "abc-not-a-phone"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_lead"
    assert "country code" in response.json()["error"]["message"]


async def test_a_contact_with_no_whatsapp_conversation_returns_null(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    created = await client.post(
        "/v1/leads",
        headers={**owner.headers, **_key("no-conv")},
        json={"name": "No chat yet", "phone": "9876543210"},
    )
    assert created.status_code == 201, created.text
    contact = created.json()["customerId"]
    found = await client.get(f"/v1/whatsapp/contacts/{contact}/conversation", headers=owner.headers)
    assert found.status_code == 200 and found.json() is None
