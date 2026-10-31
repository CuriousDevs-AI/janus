import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


async def _workflow(client: httpx.AsyncClient, headers: dict[str, str], name: str, **extra) -> dict:
    created = await client.post(
        "/v1/business/automations",
        headers=headers,
        json={"name": name, "trigger": {"type": "manual"}, "actions": [], **extra},
    )
    assert created.status_code == 201, created.text
    return created.json()


async def test_workflows_are_filed_moved_and_unfiled_with_folders(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    sales = await client.post(
        "/v1/business/automation-folders", headers=owner.headers, json={"name": "Sales"}
    )
    assert sales.status_code == 201, sales.text
    folder = sales.json()["id"]
    again = await client.post(
        "/v1/business/automation-folders", headers=owner.headers, json={"name": "sales"}
    )
    assert again.status_code == 409

    filed = await _workflow(client, owner.headers, "Follow-ups", folderId=int(folder))
    assert filed["folderId"] == folder
    loose = await _workflow(client, owner.headers, "Reminders")
    assert loose["folderId"] is None

    moved = await client.post(
        f"/v1/business/automations/{loose['id']}/folder",
        headers=owner.headers,
        json={"folderId": int(folder)},
    )
    assert moved.status_code == 200 and moved.json()["folderId"] == folder
    # Moving keeps the workflow as it was; it does not turn it back into a draft.
    assert moved.json()["status"] == loose["status"]
    listed = (await client.get("/v1/business/automation-folders", headers=owner.headers)).json()
    assert listed == [{"id": folder, "name": "Sales", "count": 2}]

    removed = await client.delete(
        f"/v1/business/automation-folders/{folder}", headers=owner.headers
    )
    assert removed.status_code == 204
    workflows = (await client.get("/v1/business/automations", headers=owner.headers)).json()
    assert {item["name"]: item["folderId"] for item in workflows} == {
        "Follow-ups": None,
        "Reminders": None,
    }

    missing = await client.post(
        f"/v1/business/automations/{loose['id']}/folder",
        headers=owner.headers,
        json={"folderId": int(folder)},
    )
    assert missing.status_code == 404


async def test_templates_start_by_hand_and_only_automation_managers_change_folders(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    templates = (
        await client.get("/v1/business/automation-templates", headers=owner.headers)
    ).json()
    assert len(templates) >= 3
    assert all(item["trigger"] == {"type": "manual"} and item["steps"] for item in templates)

    refused = await client.post(
        "/v1/business/automation-folders", headers=agent, json={"name": "Mine"}
    )
    assert refused.status_code == 403


async def test_the_editor_catalog_offers_what_runs(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    catalog = (await client.get("/v1/business/automation-catalog", headers=owner.headers)).json()
    assert catalog["triggers"] == [{"type": "manual", "label": "Run by hand"}]
    assert {"crm_sales", "hr_people"} <= {module["id"] for module in catalog["modules"]}
    assert any(module["connected"] for module in catalog["modules"])
    types = {action["type"] for action in catalog["actions"]}
    assert {"approval", "list_low_stock"} <= types
