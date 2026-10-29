import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from janus_api.core.db import session_factory
from janus_api.core.tenancy import set_context
from janus_api.timeline.service import record_event
from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

KEY = "prj-1"


async def _user_id(client: httpx.AsyncClient, headers: dict[str, str]) -> str:
    return (await client.get("/v1/me", headers=headers)).json()["user"]["id"]


async def test_members_post_and_read_while_strangers_get_not_found(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    teammate = await accept_new(client, await invite(client, mailbox, owner, "team@example.com"))
    outsider = await accept_new(client, await invite(client, mailbox, owner, "out@example.com"))

    created = await client.post(
        "/v1/project-timelines",
        headers=owner.headers,
        json={"project_key": KEY, "name": "Rajasthan rollout"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["members"] == 1

    posted = await client.post(
        f"/v1/project-timelines/{KEY}/entries",
        headers=owner.headers,
        json={"body": "Kickoff done, scope agreed", "decision": False},
    )
    assert posted.status_code == 201 and posted.json()["kind"] == "message"

    # Not a member yet: the same 404 as a timeline that does not exist.
    for path in [f"/v1/project-timelines/{KEY}", f"/v1/project-timelines/{KEY}/entries"]:
        assert (await client.get(path, headers=teammate)).status_code == 404

    added = await client.post(
        f"/v1/project-timelines/{KEY}/members",
        headers=owner.headers,
        json={"user_id": await _user_id(client, teammate)},
    )
    assert added.status_code == 201, added.text

    entries = await client.get(f"/v1/project-timelines/{KEY}/entries", headers=teammate)
    assert entries.status_code == 200
    assert [e["body"] for e in entries.json()] == ["Kickoff done, scope agreed"]
    assert (
        await client.post(
            f"/v1/project-timelines/{KEY}/entries",
            headers=teammate,
            json={"body": "Got it"},
        )
    ).status_code == 201

    assert (
        await client.get(f"/v1/project-timelines/{KEY}/entries", headers=outsider)
    ).status_code == 404


async def test_only_project_managers_add_or_remove_people(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    other = await accept_new(client, await invite(client, mailbox, owner, "other@example.com"))
    await client.post(
        "/v1/project-timelines",
        headers=owner.headers,
        json={"project_key": KEY, "name": "Project A"},
    )
    agent_id = await _user_id(client, agent)
    other_id = await _user_id(client, other)
    assert (
        await client.post(
            "/v1/project-timelines", headers=agent, json={"project_key": "prj-2", "name": "Mine"}
        )
    ).status_code == 403
    assert (
        await client.post(
            f"/v1/project-timelines/{KEY}/members", headers=agent, json={"user_id": other_id}
        )
    ).status_code == 403
    await client.post(
        f"/v1/project-timelines/{KEY}/members", headers=owner.headers, json={"user_id": agent_id}
    )
    assert (
        await client.post(
            f"/v1/project-timelines/{KEY}/members", headers=agent, json={"user_id": other_id}
        )
    ).status_code == 403
    removed = await client.delete(
        f"/v1/project-timelines/{KEY}/members/{agent_id}", headers=owner.headers
    )
    assert removed.status_code == 204
    assert (
        await client.get(f"/v1/project-timelines/{KEY}/entries", headers=agent)
    ).status_code == 404


async def test_other_companies_cannot_see_or_add_across_the_boundary(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    stranger = await signup(client, mailbox, "stranger@example.com")
    await client.post(
        "/v1/project-timelines", headers=owner.headers, json={"project_key": KEY, "name": "Secret"}
    )
    assert (
        await client.get(f"/v1/project-timelines/{KEY}", headers=stranger.headers)
    ).status_code == 404
    added = await client.post(
        f"/v1/project-timelines/{KEY}/members",
        headers=owner.headers,
        json={"user_id": str(stranger.user_id)},
    )
    assert added.status_code == 422
    assert added.json()["error"]["code"] == "not_in_company"


async def test_decisions_are_audited_and_system_events_come_only_from_modules(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    await client.post(
        "/v1/project-timelines", headers=owner.headers, json={"project_key": KEY, "name": "Audited"}
    )
    decision = await client.post(
        f"/v1/project-timelines/{KEY}/entries",
        headers=owner.headers,
        json={"body": "Ship the dispatch on Friday", "decision": True},
    )
    assert decision.status_code == 201 and decision.json()["kind"] == "decision"

    # A module writes a system entry through the service, not through the API.
    async with session_factory()() as db:
        await set_context(db, tenant_id=owner.tenant_id, user_id=owner.user_id)
        await record_event(
            db,
            owner.tenant_id,
            KEY,
            "milestone",
            "Distributor agreement accepted",
            {"amount": 15000},
        )
        await db.commit()

    entries = (
        await client.get(f"/v1/project-timelines/{KEY}/entries", headers=owner.headers)
    ).json()
    system = [e for e in entries if e["kind"] == "event"]
    assert len(system) == 1 and system[0]["author"] is None
    assert system[0]["body"] == "milestone: Distributor agreement accepted"
    assert system[0]["payload"]["amount"] == 15000

    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text(
                        "SELECT action FROM audit_log "
                        "WHERE action LIKE 'project_timeline.%' ORDER BY id"
                    )
                )
            )
            .scalars()
            .all()
        )
    assert "project_timeline.decision" in actions
    assert "project_timeline.created" in actions


async def test_blank_message_is_refused(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner = await signup(client, mailbox)
    await client.post(
        "/v1/project-timelines",
        headers=owner.headers,
        json={"project_key": KEY, "name": "Blank test"},
    )
    blank = await client.post(
        f"/v1/project-timelines/{KEY}/entries", headers=owner.headers, json={"body": "   "}
    )
    assert blank.status_code == 422


async def test_project_managers_see_the_company_directory_only(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    listed = await client.get("/v1/project-timelines/directory", headers=owner.headers)
    assert listed.status_code == 200
    names = {row["name"] for row in listed.json()}
    assert "Owner" in names and "Member" in names
    assert (await client.get("/v1/project-timelines/directory", headers=agent)).status_code == 403


async def test_archiving_records_the_closing_and_stops_new_posts(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    teammate = await accept_new(client, await invite(client, mailbox, owner, "team@example.com"))
    await client.post(
        "/v1/project-timelines", headers=owner.headers, json={"project_key": KEY, "name": "Closing"}
    )
    await client.post(
        f"/v1/project-timelines/{KEY}/members",
        headers=owner.headers,
        json={"user_id": await _user_id(client, teammate)},
    )
    await client.post(
        f"/v1/project-timelines/{KEY}/entries",
        headers=owner.headers,
        json={"body": "Final invoice sent"},
    )
    archived = await client.post(f"/v1/project-timelines/{KEY}/archive", headers=owner.headers)
    assert archived.status_code == 200, archived.text
    assert archived.json()["archived"] is True

    entries = (
        await client.get(f"/v1/project-timelines/{KEY}/entries", headers=owner.headers)
    ).json()
    closing = [e for e in entries if e["kind"] == "event"]
    assert len(closing) == 1
    assert closing[0]["payload"]["members"] == 2
    assert closing[0]["payload"]["event"] == "closed"

    refused = await client.post(
        f"/v1/project-timelines/{KEY}/entries", headers=teammate, json={"body": "one more"}
    )
    assert refused.status_code == 409
    assert (
        await client.post(f"/v1/project-timelines/{KEY}/archive", headers=owner.headers)
    ).status_code == 409

    async with admin_engine.connect() as admin:
        actions = (
            (
                await admin.execute(
                    text("SELECT action FROM audit_log WHERE action = 'project_timeline.archived'")
                )
            )
            .scalars()
            .all()
        )
    assert actions == ["project_timeline.archived"]
