import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


async def test_an_admin_reads_the_company_figures_but_does_not_share_them(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    admin = await accept_new(
        client, await invite(client, mailbox, owner, "admin@example.com", "admin")
    )
    me = (await client.get("/v1/me", headers=admin)).json()
    assert {"portfolio:read", "portfolio:finance"} <= set(me["permissions"])
    assert "portfolio:share" not in me["permissions"]

    seen = await client.get("/v1/portfolio/summary", headers=admin)
    assert seen.status_code == 200, seen.text
    company = seen.json()["companies"][0]
    # Money included, as Janus Intelligence and the department chats answer from it.
    assert company["money"] is not None and company["books"] is not None
    figures = (await client.get("/v1/business/reports/figures", headers=admin)).json()
    assert figures["readable"] is True and "profit-loss" in figures["figures"]

    # An agent still has no figures.
    agent = await accept_new(client, await invite(client, mailbox, owner, "agent@example.com"))
    assert not (await client.get("/v1/portfolio/summary", headers=agent)).json()["companies"]
