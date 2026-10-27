import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

BODY = {
    "external_key": "prj-100",
    "name": "Jaipur dock layout",
    "client": "Internal",
    "status": "active",
    "budget": "78000.00",
    "start_on": "2026-10-10",
    "end_on": "2026-11-20",
}


async def test_create_list_and_close_a_project(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await signup(client, mailbox)
    created = await client.post("/v1/project-records", headers=owner.headers, json=BODY)
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "active"

    listed = await client.get("/v1/project-records", headers=owner.headers)
    assert [p["external_key"] for p in listed.json()] == ["prj-100"]

    duplicate = await client.post("/v1/project-records", headers=owner.headers, json=BODY)
    assert duplicate.status_code == 409

    done = await client.patch(
        "/v1/project-records/prj-100", headers=owner.headers, json={"status": "done"}
    )
    assert done.status_code == 200 and done.json()["status"] == "done"
    reopened = await client.patch(
        "/v1/project-records/prj-100", headers=owner.headers, json={"status": "active"}
    )
    assert reopened.status_code == 409
    assert reopened.json()["error"]["code"] == "closed"


async def test_rules_on_dates_status_and_owner(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await signup(client, mailbox)
    backwards = {**BODY, "external_key": "prj-101", "end_on": "2026-09-01"}
    assert (
        await client.post("/v1/project-records", headers=owner.headers, json=backwards)
    ).status_code == 422
    bad_status = {**BODY, "external_key": "prj-102", "status": "maybe"}
    assert (
        await client.post("/v1/project-records", headers=owner.headers, json=bad_status)
    ).status_code == 422
    stranger = await signup(client, mailbox, "stranger@example.com")
    foreign_owner = {**BODY, "external_key": "prj-103", "owner_user_id": str(stranger.user_id)}
    refused = await client.post("/v1/project-records", headers=owner.headers, json=foreign_owner)
    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "owner_not_in_company"


async def test_members_without_project_rights_are_refused_and_companies_are_isolated(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    await client.post("/v1/project-records", headers=owner.headers, json=BODY)
    assert (await client.get("/v1/project-records", headers=agent)).status_code == 403
    assert (
        await client.post("/v1/project-records", headers=agent, json={**BODY, "external_key": "x"})
    ).status_code == 403
    other = await signup(client, mailbox, "other@example.com")
    assert (await client.get("/v1/project-records", headers=other.headers)).json() == []
    assert (
        await client.patch(
            "/v1/project-records/prj-100", headers=other.headers, json={"status": "done"}
        )
    ).status_code == 404
