import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


async def test_people_show_when_they_were_last_active_and_access_changes_read_in_words(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    await accept_new(client, await invite(client, mailbox, owner, "meera@example.com"))
    await client.post(
        "/v1/invitations",
        headers=owner.headers,
        json={"email": "late@example.com", "role": "agent"},
    )
    members = (await client.get("/v1/members", headers=owner.headers)).json()
    by_email = {item["email"]: item for item in members}
    assert by_email["owner@example.com"]["last_active_at"] is not None
    assert by_email["meera@example.com"]["last_active_at"] is not None
    meera = by_email["meera@example.com"]["id"]

    changed = await client.patch(
        f"/v1/members/{meera}", headers=owner.headers, json={"role": "manager"}
    )
    assert changed.status_code == 200, changed.text
    given = await client.put(
        f"/v1/members/{meera}/workspace-access",
        headers=owner.headers,
        json={"permissions": ["stock:adjust"]},
    )
    assert given.status_code == 200, given.text
    team = await client.post("/v1/teams", headers=owner.headers, json={"name": "Dispatch"})
    assert team.status_code == 201, team.text
    added = await client.put(
        f"/v1/teams/{team.json()['id']}/members/{meera}", headers=owner.headers
    )
    assert added.status_code == 204, added.text

    log = await client.get("/v1/access-log", headers=owner.headers)
    assert log.status_code == 200, log.text
    lines = [f"{item['actor']} {item['text']}" for item in log.json()]
    name = by_email["owner@example.com"]["name"]
    assert lines[:4] == [
        f"{name} added Member to the Dispatch team",
        f"{name} created the Dispatch team",
        f"{name} gave Member access to Stock",
        f"{name} set Member's role to Manager",
    ]
    assert f"{name} invited late@example.com as Agent" in lines
    assert "Member accepted an invitation and joined" in lines
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (await client.get("/v1/access-log", headers=agent)).status_code == 403
