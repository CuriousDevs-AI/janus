import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


async def test_every_member_gets_their_own_hr_and_hr_admin_stays_with_owners(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    agent = await accept_new(client, await invite(client, mailbox, owner, "asha@example.com"))
    manager = await accept_new(
        client, await invite(client, mailbox, owner, "ravi@example.com", role="manager")
    )

    agent_permissions = set((await client.get("/v1/me", headers=agent)).json()["permissions"])
    assert "hr:self" in agent_permissions
    assert not agent_permissions & {"hr:read", "hr:team", "hr:approve", "hr:manage"}

    manager_me = (await client.get("/v1/me", headers=manager)).json()
    manager_permissions = set(manager_me["permissions"])
    assert {"hr:self", "hr:team", "hr:approve"} <= manager_permissions
    assert "hr:manage" not in manager_permissions

    owner_me = (await client.get("/v1/me", headers=owner.headers)).json()
    assert {"hr:self", "hr:read", "hr:team", "hr:approve", "hr:manage"} <= set(
        owner_me["permissions"]
    )
