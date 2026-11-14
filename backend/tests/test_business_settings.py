import httpx

from tests.conftest import Mailbox
from tests.helpers import signup


async def test_saved_hours_come_back_and_bad_times_are_refused(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    saved = await client.patch(
        "/v1/business/setup",
        headers=owner.headers,
        json={
            "timezone": "Asia/Kolkata",
            "businessHoursStart": "10:00",
            "businessHoursEnd": "19:30",
        },
    )
    assert saved.status_code == 200, saved.text
    setup = (await client.get("/v1/business/setup", headers=owner.headers)).json()
    assert setup["timezone"] == "Asia/Kolkata"
    assert (setup["businessHoursStart"], setup["businessHoursEnd"]) == ("10:00", "19:30")

    for wrong in ("25:00", "9am", "10:7"):
        refused = await client.patch(
            "/v1/business/setup", headers=owner.headers, json={"businessHoursStart": wrong}
        )
        assert refused.status_code == 422, wrong
