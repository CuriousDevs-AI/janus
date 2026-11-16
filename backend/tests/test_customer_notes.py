"""Customer notes on contact records, and lead search extended to follow-up note text."""

import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


async def test_customer_notes_crud_and_visibility(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))

    # Create a lead so we have a customer (contact).
    lead = (
        await client.post(
            "/v1/leads",
            headers={**owner.headers, "Idempotency-Key": "note-test-1"},
            json={"name": "Agarwal Textiles", "phone": "9876500222", "company": "Agarwal Group"},
        )
    ).json()
    contact_id = lead["customerId"]

    # No notes yet.
    resp = await client.get(f"/v1/contacts/{contact_id}/notes", headers=owner.headers)
    assert resp.status_code == 200
    assert resp.json() == []

    # Add a note.
    resp = await client.post(
        f"/v1/contacts/{contact_id}/notes",
        headers=owner.headers,
        json={"body": "Met Agarwal, agreed on 500m cotton at 480/m, delivery by Dec end."},
    )
    assert resp.status_code == 201
    note = resp.json()
    assert note["body"] == "Met Agarwal, agreed on 500m cotton at 480/m, delivery by Dec end."
    assert note["author"] == "Owner"
    assert "createdAt" in note

    # Add a second note.
    resp = await client.post(
        f"/v1/contacts/{contact_id}/notes",
        headers=owner.headers,
        json={"body": "Prefers 40s count cotton, pays on the 20th."},
    )
    assert resp.status_code == 201

    # List notes: most recent first.
    resp = await client.get(f"/v1/contacts/{contact_id}/notes", headers=owner.headers)
    notes = resp.json()
    assert len(notes) == 2
    assert notes[0]["body"] == "Prefers 40s count cotton, pays on the 20th."
    assert notes[1]["body"] == "Met Agarwal, agreed on 500m cotton at 480/m, delivery by Dec end."

    # Assign lead to agent so agent can see the customer.
    agent_me = (await client.get("/v1/me", headers=agent)).json()
    agent_id = agent_me["user"]["id"]
    await client.post(
        "/v1/leads/assign",
        headers=owner.headers,
        json={"leadIds": [lead["id"]], "ownerId": agent_id},
    )

    # Agent can see notes on the same customer.
    resp = await client.get(f"/v1/contacts/{contact_id}/notes", headers=agent)
    assert resp.status_code == 200
    assert len(resp.json()) == 2

    # Agent can add a note.
    resp = await client.post(
        f"/v1/contacts/{contact_id}/notes",
        headers=agent,
        json={"body": "Called to confirm delivery schedule."},
    )
    assert resp.status_code == 201
    assert resp.json()["author"] == "Member"

    # Stranger in another company cannot see notes.
    stranger = await signup(client, mailbox, "stranger@example.com")
    resp = await client.get(f"/v1/contacts/{contact_id}/notes", headers=stranger.headers)
    assert resp.status_code == 404

    # Validation: body too short.
    resp = await client.post(
        f"/v1/contacts/{contact_id}/notes",
        headers=owner.headers,
        json={"body": "x"},
    )
    assert resp.status_code == 422


async def test_lead_search_matches_follow_up_note_text(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)

    # Create two leads.
    lead1 = (
        await client.post(
            "/v1/leads",
            headers={**owner.headers, "Idempotency-Key": "search-1"},
            json={"name": "Ramesh Kumar", "phone": "9876500333"},
        )
    ).json()
    lead2 = (
        await client.post(
            "/v1/leads",
            headers={**owner.headers, "Idempotency-Key": "search-2"},
            json={"name": "Sunil Joshi", "phone": "9876500444"},
        )
    ).json()

    # Add a follow-up note mentioning "silk fabric" only on lead1.
    await client.post(
        f"/v1/leads/{lead1['id']}/notes",
        headers=owner.headers,
        json={"body": "Interested in silk fabric for wedding season."},
    )

    # Search for "silk fabric" should find lead1 but not lead2.
    resp = await client.get("/v1/leads?q=silk+fabric", headers=owner.headers)
    assert resp.status_code == 200
    results = resp.json()
    lead_ids = [r["id"] for r in results]
    assert lead1["id"] in lead_ids
    assert lead2["id"] not in lead_ids

    # Search by name still works.
    resp = await client.get("/v1/leads?q=Sunil", headers=owner.headers)
    results = resp.json()
    lead_ids = [r["id"] for r in results]
    assert lead2["id"] in lead_ids

    # Empty search returns all leads.
    resp = await client.get("/v1/leads", headers=owner.headers)
    assert len(resp.json()) == 2
