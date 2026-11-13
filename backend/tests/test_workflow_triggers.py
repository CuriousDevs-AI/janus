import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from janus_api.business.engine import run_once
from tests.conftest import Mailbox
from tests.test_workflow_runner import _company, _messages, _post, _runs, _workflow, worker

assert worker  # The worker's restricted login, shared with the runner tests.


async def test_a_captured_lead_and_an_opened_ticket_start_their_workflows(
    client: httpx.AsyncClient, mailbox: Mailbox, worker: async_sessionmaker[AsyncSession]
) -> None:
    owner, space = await _company(client, mailbox)
    catalog = (await client.get("/v1/business/automation-catalog", headers=owner.headers)).json()
    assert [item["type"] for item in catalog["triggers"]] == [
        "manual",
        "lead_created",
        "ticket_created",
    ]
    on_lead = await _workflow(
        client,
        owner,
        [_post("New lead: {{lead.name}} wants {{lead.requirement}}")],
        trigger={"type": "lead_created"},
        requiresApproval=False,
    )
    on_ticket = await _workflow(
        client,
        owner,
        [_post("Ticket {{ticket.number}} ({{ticket.priority}}): {{ticket.subject}}")],
        name="Ticket alert",
        trigger={"type": "ticket_created"},
    )
    # A draft does not start on events; only switched-on workflows do.
    await _workflow(client, owner, [_post("Draft")], name="Draft", trigger={"type": "lead_created"})
    for workflow in (on_lead, on_ticket):
        published = await client.post(
            f"/v1/business/automations/{workflow}/publish", headers=owner.headers, json={}
        )
        assert published.status_code == 200, published.text

    lead = await client.post(
        "/v1/leads",
        headers={**owner.headers, "Idempotency-Key": "lead-1"},
        json={"name": "Asha Traders", "phone": "9876543210", "requirement": "40 cartons"},
    )
    assert lead.status_code == 201, lead.text
    ticket = await client.post(
        "/v1/support/tickets",
        headers=owner.headers,
        json={
            "external_key": "tck-1",
            "number": "#1042",
            "subject": "Invoice total is wrong",
            "priority": "high",
        },
    )
    assert ticket.status_code == 201, ticket.text

    [lead_run] = await _runs(client, owner, on_lead)
    assert lead_run["status"] == "queued"
    assert lead_run["recordRef"] == {"lead_id": int(lead.json()["id"])}
    [ticket_run] = await _runs(client, owner, on_ticket)
    assert ticket_run["status"] == "pending_approval"

    assert await run_once(worker) is True
    assert await run_once(worker) is False
    assert await _messages(client, owner, space) == ["New lead: Asha Traders wants 40 cartons"]

    approve = f"/v1/business/automations/executions/{ticket_run['id']}/approve"
    assert (await client.post(approve, headers=owner.headers)).status_code == 200
    assert await run_once(worker) is True
    assert (await _runs(client, owner, on_ticket))[0]["status"] == "completed"
    assert set(await _messages(client, owner, space)) == {
        "New lead: Asha Traders wants 40 cartons",
        "Ticket #1042 (high): Invoice total is wrong",
    }


async def test_an_event_workflow_with_unsupported_steps_cannot_be_switched_on(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _ = await _company(client, mailbox)
    workflow = await _workflow(
        client,
        owner,
        [{"id": "crm", "module": "crm_sales", "action": "create_task"}],
        trigger={"type": "lead_created"},
    )
    published = await client.post(
        f"/v1/business/automations/{workflow}/publish", headers=owner.headers, json={}
    )
    assert published.status_code == 422
    assert "CRM follow-up tasks" in published.json()["error"]["message"]


async def test_a_workflow_that_starts_on_its_own_is_switched_on_only_when_ready(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _ = await _company(client, mailbox)
    template = next(
        item
        for item in (
            await client.get("/v1/business/automation-templates", headers=owner.headers)
        ).json()
        if item["id"] == "new-lead-alert"
    )
    workflow = await _workflow(
        client, owner, template["steps"], trigger=template["trigger"], requiresApproval=False
    )
    listed = next(
        item
        for item in (await client.get("/v1/business/automations", headers=owner.headers)).json()
        if item["id"] == workflow
    )
    assert listed["problems"] == ["Step 1: choose the Team Chat channel to post in."]
    for path in ("on", "publish"):
        refused = await client.post(
            f"/v1/business/automations/{workflow}/{path}", headers=owner.headers, json={}
        )
        assert refused.status_code == 422, refused.text
        assert refused.json()["error"]["code"] == "not_ready"

    # A ticket's fields in a lead workflow are named, and so is a workflow with no steps.
    config = {"channel": "sales-floor", "message": "{{ticket.number}}"}
    step = {**template["steps"][0], "config": config}
    changed = await client.patch(
        f"/v1/business/automations/{workflow}", headers=owner.headers, json={"actions": [step]}
    )
    assert changed.json()["problems"] == [
        "Step 1 uses {{ticket.number}}, but this workflow does not start from a ticket."
    ]
    empty = await _workflow(client, owner, [], name="Empty")
    shown = (await client.get(f"/v1/business/automations/{empty}", headers=owner.headers)).json()
    assert shown["problems"] == ["Add a step: this workflow does nothing yet."]

    step["config"]["message"] = "New lead: {{lead.name}}"
    await client.patch(
        f"/v1/business/automations/{workflow}", headers=owner.headers, json={"actions": [step]}
    )
    switched = await client.post(f"/v1/business/automations/{workflow}/on", headers=owner.headers)
    assert switched.status_code == 200, switched.text
    assert switched.json()["status"] == "active" and switched.json()["problems"] == []
