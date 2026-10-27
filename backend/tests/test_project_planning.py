import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

PROJECT = {
    "external_key": "prj-200",
    "name": "Distributor rollout",
    "client": "Rajputana Co-op",
    "status": "active",
    "budget": "42000.00",
    "start_on": "2026-10-01",
    "end_on": "2026-12-15",
}
MILESTONE = {
    "external_key": "ms-1",
    "name": "Agreement signed",
    "due_on": "2026-10-20",
    "amount": "15000",
}


async def _setup(client: httpx.AsyncClient, mailbox: Mailbox) -> tuple:
    owner = await signup(client, mailbox)
    await client.post("/v1/project-records", headers=owner.headers, json=PROJECT)
    return owner


async def test_milestone_moves_planned_done_accepted_by_someone_else(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    second = await accept_new(
        client, await invite(client, mailbox, owner, "second@example.com", role="owner")
    )
    created = await client.post(
        "/v1/project-records/prj-200/milestones", headers=owner.headers, json=MILESTONE
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "planned"
    assert (
        await client.post(
            "/v1/project-records/prj-200/milestones", headers=owner.headers, json=MILESTONE
        )
    ).status_code == 409

    done = await client.post(
        "/v1/project-records/prj-200/milestones/ms-1/status",
        headers=owner.headers,
        json={"status": "done"},
    )
    assert done.status_code == 200 and done.json()["completed_by"] is not None

    self_accept = await client.post(
        "/v1/project-records/prj-200/milestones/ms-1/status",
        headers=owner.headers,
        json={"status": "accepted"},
    )
    assert self_accept.status_code == 403
    assert self_accept.json()["error"]["code"] == "self_acceptance"

    accepted = await client.post(
        "/v1/project-records/prj-200/milestones/ms-1/status",
        headers=second,
        json={"status": "accepted"},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "accepted" and accepted.json()["accepted_by"] is not None

    reopened = await client.post(
        "/v1/project-records/prj-200/milestones/ms-1/status",
        headers=owner.headers,
        json={"status": "done"},
    )
    assert reopened.status_code == 409


async def test_accepting_before_completing_is_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    await client.post(
        "/v1/project-records/prj-200/milestones", headers=owner.headers, json=MILESTONE
    )
    early = await client.post(
        "/v1/project-records/prj-200/milestones/ms-1/status",
        headers=owner.headers,
        json={"status": "accepted"},
    )
    assert early.status_code == 409


async def test_tasks_link_to_milestones_and_company_members(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    member = await accept_new(client, await invite(client, mailbox, owner, "member@example.com"))
    member_id = (await client.get("/v1/me", headers=member)).json()["user"]["id"]
    await client.post(
        "/v1/project-records/prj-200/milestones", headers=owner.headers, json=MILESTONE
    )

    task = {
        "external_key": "tk-1",
        "title": "Confirm festive order split",
        "milestone_key": "ms-1",
        "assignee_user_id": member_id,
        "due_on": "2026-10-25",
    }
    created = await client.post(
        "/v1/project-records/prj-200/tasks", headers=owner.headers, json=task
    )
    assert created.status_code == 201, created.text
    assert created.json()["milestone_key"] == "ms-1"

    stranger = await signup(client, mailbox, "stranger@example.com")
    outside = {**task, "external_key": "tk-2", "assignee_user_id": str(stranger.user_id)}
    refused = await client.post(
        "/v1/project-records/prj-200/tasks", headers=owner.headers, json=outside
    )
    assert refused.status_code == 422

    moved = await client.post(
        "/v1/project-records/prj-200/tasks/tk-1/status",
        headers=owner.headers,
        json={"status": "done"},
    )
    assert moved.status_code == 200 and moved.json()["status"] == "done"
    listed = (await client.get("/v1/project-records/prj-200/tasks", headers=owner.headers)).json()
    assert listed[0]["milestone_key"] == "ms-1"


async def test_planning_needs_project_rights_and_stays_inside_the_company(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await _setup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert (
        await client.post("/v1/project-records/prj-200/milestones", headers=agent, json=MILESTONE)
    ).status_code == 403
    other = await signup(client, mailbox, "other@example.com")
    assert (
        await client.get("/v1/project-records/prj-200/milestones", headers=other.headers)
    ).status_code == 404
