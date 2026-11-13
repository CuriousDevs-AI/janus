import os
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from janus_api.business.engine import run_once
from tests.conftest import Mailbox
from tests.helpers import Account, signup

PROJECT = {
    "external_key": "prj-200",
    "name": "Distributor rollout",
    "client": "Rajputana Co-op",
    "status": "active",
    "budget": "42000.00",
    "start_on": "2026-10-01",
    "end_on": "2026-12-15",
}


@pytest.fixture
async def worker() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """The worker's own restricted database login, as the real worker runs."""
    engine = create_async_engine(os.environ["JANUS_TEST_WORKER_URL"])
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def _company(client: httpx.AsyncClient, mailbox: Mailbox) -> tuple[Account, str]:
    owner = await signup(client, mailbox)
    channel = await client.post(
        "/v1/team/channels", headers=owner.headers, json={"name": "sales-floor"}
    )
    assert channel.status_code == 201, channel.text
    project = await client.post("/v1/project-records", headers=owner.headers, json=PROJECT)
    assert project.status_code == 201, project.text
    return owner, channel.json()["id"]


async def _workflow(
    client: httpx.AsyncClient, owner: Account, actions: list[dict[str, Any]], **extra: Any
) -> str:
    created = await client.post(
        "/v1/business/automations",
        headers=owner.headers,
        json={"name": "Lead follow-up", "trigger": {"type": "manual"}, "actions": actions, **extra},
    )
    assert created.status_code == 201, created.text
    return str(created.json()["id"])


def _post(message: str) -> dict[str, Any]:
    return {
        "id": "notify",
        "module": "communication",
        "action": "send_notification",
        "config": {"channel": "sales-floor", "message": message},
    }


TASK: dict[str, Any] = {
    "id": "task",
    "module": "projects_delivery",
    "action": "create_task",
    "config": {"project": "prj-200", "title": "Call back after {{workflow.name}}", "dueInDays": 2},
}


async def _runs(client: httpx.AsyncClient, owner: Account, workflow: str) -> list[dict[str, Any]]:
    runs = await client.get(f"/v1/business/automations/{workflow}/runs", headers=owner.headers)
    assert runs.status_code == 200, runs.text
    return list(runs.json())


async def _messages(client: httpx.AsyncClient, owner: Account, space: str) -> list[str]:
    listed = await client.get(f"/v1/team/spaces/{space}/messages", headers=owner.headers)
    assert listed.status_code == 200, listed.text
    return [item["body"] for item in listed.json()]


async def test_an_approved_run_carries_out_its_steps_and_records_each_one(
    client: httpx.AsyncClient, mailbox: Mailbox, worker: async_sessionmaker[AsyncSession]
) -> None:
    owner, space = await _company(client, mailbox)
    workflow = await _workflow(
        client,
        owner,
        [
            {"id": "ok", "module": "business", "action": "approval"},
            _post("Follow up the new enquiry ({{workflow.name}})"),
            TASK,
        ],
    )
    run = await client.post(f"/v1/business/automations/{workflow}/run", headers=owner.headers)
    assert run.status_code == 202, run.text
    assert run.json()["status"] == "pending_approval"
    # Nothing happens before someone approves the run.
    assert await run_once(worker) is False
    assert await _messages(client, owner, space) == []

    url = f"/v1/business/automations/executions/{run.json()['id']}/approve"
    approved = await client.post(url, headers=owner.headers)
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    assert (await client.post(url, headers=owner.headers)).status_code == 409

    assert await run_once(worker) is True
    assert await run_once(worker) is False
    [done] = await _runs(client, owner, workflow)
    assert done["status"] == "completed" and done["endedAt"] is not None
    assert [(step["id"], step["status"]) for step in done["steps"]] == [
        ("ok", "approved"),
        ("notify", "done"),
        ("task", "done"),
    ]
    assert done["steps"][1]["detail"] == "Posted in #sales-floor"
    assert await _messages(client, owner, space) == ["Follow up the new enquiry (Lead follow-up)"]
    tasks = (await client.get("/v1/project-records/prj-200/tasks", headers=owner.headers)).json()
    assert [(task["title"], task["status"]) for task in tasks] == [
        ("Call back after Lead follow-up", "todo")
    ]


async def test_a_run_waits_at_an_approval_step_after_its_earlier_steps(
    client: httpx.AsyncClient, mailbox: Mailbox, worker: async_sessionmaker[AsyncSession]
) -> None:
    owner, space = await _company(client, mailbox)
    workflow = await _workflow(
        client,
        owner,
        [_post("First"), {"id": "check", "module": "business", "action": "approval"}, TASK],
        requiresApproval=False,
    )
    run = await client.post(f"/v1/business/automations/{workflow}/run", headers=owner.headers)
    assert run.json()["status"] == "queued"
    assert await run_once(worker) is True
    [waiting] = await _runs(client, owner, workflow)
    assert waiting["status"] == "pending_approval"
    assert [step["status"] for step in waiting["steps"]] == ["done"]
    assert await _messages(client, owner, space) == ["First"]

    approve = f"/v1/business/automations/executions/{run.json()['id']}/approve"
    assert (await client.post(approve, headers=owner.headers)).status_code == 200
    assert await run_once(worker) is True
    [done] = await _runs(client, owner, workflow)
    assert done["status"] == "completed"
    assert [step["status"] for step in done["steps"]] == ["done", "approved", "done"]
    # The first step is not repeated when the run carries on.
    assert await _messages(client, owner, space) == ["First"]


async def test_a_failing_step_stops_the_run_and_says_why(
    client: httpx.AsyncClient, mailbox: Mailbox, worker: async_sessionmaker[AsyncSession]
) -> None:
    owner, space = await _company(client, mailbox)
    missing = {**TASK, "config": {**TASK["config"], "project": "prj-404"}}
    workflow = await _workflow(
        client, owner, [_post("Posted"), missing, _post("Never")], requiresApproval=False
    )
    await client.post(f"/v1/business/automations/{workflow}/run", headers=owner.headers)
    assert await run_once(worker) is True
    [failed] = await _runs(client, owner, workflow)
    assert failed["status"] == "failed"
    assert [step["status"] for step in failed["steps"]] == ["done", "failed"]
    assert failed["steps"][1]["error"] == {"code": "not_found", "message": "Project not found."}
    assert failed["result"]["error"]["message"] == "Step 2 failed."
    # A step already carried out stays done; the steps after the failure never run.
    assert await _messages(client, owner, space) == ["Posted"]

    unknown = await _workflow(
        client,
        owner,
        [{**_post("Hello {{lead.name}}"), "id": "hello"}],
        name="Lead greeting",
        requiresApproval=False,
    )
    await client.post(f"/v1/business/automations/{unknown}/run", headers=owner.headers)
    assert await run_once(worker) is True
    [bad] = await _runs(client, owner, unknown)
    assert bad["status"] == "failed" and bad["steps"][0]["error"]["code"] == "unknown_field"


async def test_unsupported_steps_are_refused_without_running_anything(
    client: httpx.AsyncClient, mailbox: Mailbox, worker: async_sessionmaker[AsyncSession]
) -> None:
    owner, space = await _company(client, mailbox)
    catalog = (await client.get("/v1/business/automation-catalog", headers=owner.headers)).json()
    supported = {(item["type"], item["module"]): item["supported"] for item in catalog["actions"]}
    assert supported[("send_notification", "communication")] is True
    assert supported[("create_task", "projects_delivery")] is True
    assert supported[("create_task", "crm_sales")] is False
    assert supported[("list_low_stock", "operations_inventory")] is False

    low_stock = {"id": "stock", "module": "operations_inventory", "action": "list_low_stock"}
    workflow = await _workflow(client, owner, [_post("Hi"), low_stock], requiresApproval=False)
    refused = await client.post(f"/v1/business/automations/{workflow}/run", headers=owner.headers)
    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "unsupported_steps"
    assert "step 2" in refused.json()["error"]["message"]
    test = await client.post(
        f"/v1/business/automations/{workflow}/test", headers=owner.headers, json={}
    )
    assert [item["action"] for item in test.json()["result"]["unsupported"]] == ["list_low_stock"]

    # A disabled step is skipped, so the workflow can run.
    await client.patch(
        f"/v1/business/automations/{workflow}",
        headers=owner.headers,
        json={"actions": [_post("Hi"), {**low_stock, "disabled": True}]},
    )
    run = await client.post(f"/v1/business/automations/{workflow}/run", headers=owner.headers)
    assert run.status_code == 202, run.text
    # The workflow is changed again before the worker picks the run up: the run is refused.
    await client.patch(
        f"/v1/business/automations/{workflow}",
        headers=owner.headers,
        json={"actions": [_post("Hi"), low_stock]},
    )
    assert await run_once(worker) is True
    run_out, dry_run = await _runs(client, owner, workflow)
    assert (run_out["status"], dry_run["status"]) == ("refused", "dry_run")
    assert [(step["id"], step["status"]) for step in run_out["steps"]] == [("stock", "refused")]
    assert await _messages(client, owner, space) == []
