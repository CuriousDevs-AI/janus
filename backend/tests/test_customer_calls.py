import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


async def _lead(client: httpx.AsyncClient, headers: dict[str, str], key: str, phone: str) -> dict:
    created = await client.post(
        "/v1/leads",
        headers={**headers, "Idempotency-Key": key},
        json={"name": "Meera Traders", "phone": phone},
    )
    assert created.status_code == 201, created.text
    return created.json()


async def test_an_agent_logs_a_phone_call_and_sees_it_on_the_contact(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    lead = await _lead(client, owner.headers, "call-lead", "9876543210")
    contact = lead["customerId"]

    logged = await client.post(
        f"/v1/contacts/{contact}/calls",
        headers=owner.headers,
        json={"outcome": "connected", "duration_seconds": 185, "notes": " Wants 40 cartons "},
    )
    assert logged.status_code == 201, logged.text
    call = logged.json()
    assert call["method"] == "phone" and call["status"] == "logged"
    assert call["durationSeconds"] == 185 and call["notes"] == "Wants 40 cartons"

    missed = await client.post(
        f"/v1/contacts/{contact}/calls",
        headers=owner.headers,
        json={"outcome": "no_answer", "duration_seconds": 30},
    )
    assert missed.json()["durationSeconds"] is None

    listed = (await client.get(f"/v1/contacts/{contact}/calls", headers=owner.headers)).json()
    assert [item["outcome"] for item in listed] == ["no_answer", "connected"]

    edited = await client.patch(
        f"/v1/calls/{call['id']}", headers=owner.headers, json={"notes": "Call back Friday"}
    )
    assert edited.status_code == 200 and edited.json()["notes"] == "Call back Friday"

    bad = await client.post(
        f"/v1/contacts/{contact}/calls", headers=owner.headers, json={"outcome": "maybe"}
    )
    assert bad.status_code == 422


async def test_calls_follow_the_contacts_visibility(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    lead = await _lead(client, owner.headers, "private-lead", "9876543211")
    token = await invite(client, mailbox, owner, "asha@example.com")
    agent = await accept_new(client, token)

    contact = lead["customerId"]
    hidden = await client.get(f"/v1/contacts/{contact}/calls", headers=agent)
    assert hidden.status_code == 404
    refused = await client.post(
        f"/v1/contacts/{contact}/calls", headers=agent, json={"outcome": "busy"}
    )
    assert refused.status_code == 404

    call = (
        await client.post(
            f"/v1/contacts/{contact}/calls", headers=owner.headers, json={"outcome": "busy"}
        )
    ).json()
    other = await client.patch(f"/v1/calls/{call['id']}", headers=agent, json={"notes": "x"})
    assert other.status_code == 404


async def test_a_browser_call_link_lets_the_customer_join_once(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    lead = await _lead(client, owner.headers, "browser-lead", "9876543212")
    started = await client.post(
        f"/v1/contacts/{lead['customerId']}/calls/browser", headers=owner.headers
    )
    assert started.status_code == 201, started.text
    body = started.json()
    call, link = body["call"], body["link"]
    assert call["status"] == "ringing" and call["method"] == "browser"
    token = link.rsplit("/call/", 1)[1]

    # The customer has no account: the token alone opens the call.
    view = await client.get(f"/v1/public/calls/{token}")
    assert view.status_code == 200, view.text
    assert view.json()["status"] == "ringing" and view.json()["agentName"]
    assert "iceServers" in view.json()["ice"]

    early = await client.post(
        f"/v1/public/calls/{token}/signal", json={"kind": "ice", "payload": {"c": 1}}
    )
    assert early.status_code == 409

    assert (await client.post(f"/v1/public/calls/{token}/join")).status_code == 204
    sent = await client.post(
        f"/v1/public/calls/{token}/signal", json={"kind": "answer", "payload": {"sdp": "x"}}
    )
    assert sent.status_code == 204
    offer = await client.post(
        f"/v1/calls/{call['id']}/signal",
        headers=owner.headers,
        json={"kind": "offer", "payload": {"sdp": "y"}},
    )
    assert offer.status_code == 204

    live = (
        await client.get(f"/v1/contacts/{lead['customerId']}/calls", headers=owner.headers)
    ).json()[0]
    assert live["status"] == "live" and live["startedAt"]

    ended = await client.post(f"/v1/calls/{call['id']}/end", headers=owner.headers)
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended" and ended.json()["outcome"] == "connected"
    assert ended.json()["durationSeconds"] is not None

    gone = await client.get(f"/v1/public/calls/{token}")
    assert gone.status_code == 404
    assert (await client.get("/v1/public/calls/not-a-real-token-at-all-xyz")).status_code == 404


async def test_an_unanswered_link_ends_as_no_answer_and_do_not_contact_is_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    lead = await _lead(client, owner.headers, "quiet-lead", "9876543213")
    contact = lead["customerId"]
    call = (
        await client.post(f"/v1/contacts/{contact}/calls/browser", headers=owner.headers)
    ).json()["call"]
    ended = (await client.post(f"/v1/calls/{call['id']}/end", headers=owner.headers)).json()
    assert ended["outcome"] == "no_answer" and ended["durationSeconds"] is None

    consent = await client.patch(
        f"/v1/contacts/{contact}/consent", headers=owner.headers, json={"doNotContact": True}
    )
    assert consent.status_code == 200, consent.text
    refused = await client.post(f"/v1/contacts/{contact}/calls/browser", headers=owner.headers)
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "do_not_contact"
