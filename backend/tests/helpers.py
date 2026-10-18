from dataclasses import dataclass

import httpx

from tests.conftest import Mailbox

PASSWORD = "India-business!7482"
NEW_PASSWORD = "New-business!8374"


@dataclass
class Account:
    email: str
    access: str
    refresh: str
    user_id: int
    tenant_id: int

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access}"}


async def signup(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    address: str = "owner@example.com",
    *,
    verify: bool = True,
) -> Account:
    response = await client.post(
        "/v1/auth/signup",
        json={
            "name": "Owner",
            "email": address,
            "password": PASSWORD,
            "business_name": "Mumbai Traders",
        },
    )
    assert response.status_code == 201, response.text
    if verify:
        response = await client.post(
            "/v1/auth/verify-email",
            json={
                "token": mailbox.token(address, "verify-email"),
            },
        )
        assert response.status_code == 200, response.text
    return await login(client, address)


async def login(client: httpx.AsyncClient, address: str, password: str = PASSWORD) -> Account:
    response = await client.post("/v1/auth/login", json={"email": address, "password": password})
    assert response.status_code == 200, response.text
    pair = response.json()
    account = Account(address, pair["access_token"], pair["refresh_token"], 0, 0)
    response = await client.get("/v1/me", headers=account.headers)
    assert response.status_code == 200, response.text
    account.user_id = int(response.json()["user"]["id"])
    account.tenant_id = int(response.json()["tenant"]["id"])
    return account


async def invite(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    owner: Account,
    address: str,
    role: str = "agent",
) -> str:
    response = await client.post(
        "/v1/invitations", headers=owner.headers, json={"email": address, "role": role}
    )
    assert response.status_code == 201, response.text
    return mailbox.token(address, "invite")


async def accept_new(client: httpx.AsyncClient, token: str) -> dict[str, str]:
    response = await client.post(
        f"/v1/invitations/{token}/accept", json={"name": "Member", "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
