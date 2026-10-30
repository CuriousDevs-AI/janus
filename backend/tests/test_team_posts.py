from datetime import UTC, datetime, timedelta

import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _company(client: httpx.AsyncClient, mailbox: Mailbox):
    owner = await signup(client, mailbox)
    asha = await accept_new(client, await invite(client, mailbox, owner, "asha@example.com"))
    ravi = await accept_new(client, await invite(client, mailbox, owner, "ravi@example.com"))
    members = (await client.get("/v1/members", headers=owner.headers)).json()
    ids = {item["email"]: int(item["user_id"]) for item in members}
    return owner, asha, ravi, ids


async def _announcements(client: httpx.AsyncClient, headers: dict[str, str]) -> dict:
    channels = (await client.get("/v1/team/channels", headers=headers)).json()
    return next(item for item in channels if item["announcements"])


async def test_everyone_is_in_announcements_and_only_announcers_post_and_email_everyone(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, ravi, _ = await _company(client, mailbox)
    space = await _announcements(client, owner.headers)
    assert space["name"] == "announcements" and space["canPost"] is True
    for member in (asha, ravi):
        theirs = await _announcements(client, member)
        assert theirs["id"] == space["id"] and theirs["joined"] and not theirs["canPost"]

    refused = await client.post(
        f"/v1/team/spaces/{space['id']}/messages",
        headers={**asha, **_key("a-1")},
        json={"body": "Can I post?"},
    )
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "announcers_only"
    left = await client.post(f"/v1/team/channels/{space['id']}/leave", headers=asha)
    assert left.status_code == 422

    mailbox.messages.clear()
    posted = await client.post(
        f"/v1/team/spaces/{space['id']}/posts",
        headers={**owner.headers, **_key("ann-1")},
        json={"kind": "announcement", "title": "Office closed Friday", "body": "Diwali holiday."},
    )
    assert posted.status_code == 201, posted.text
    message = posted.json()
    assert message["kind"] == "announcement" and message["title"] == "Office closed Friday"
    sent_to = sorted(address for address, _, _ in mailbox.messages)
    assert sent_to == ["asha@example.com", "ravi@example.com"]
    assert all("Office closed Friday" in subject for _, subject, _ in mailbox.messages)

    feed = (await client.get("/v1/team/announcements", headers=ravi)).json()
    assert feed[0]["id"] == message["id"] and feed[0]["title"] == "Office closed Friday"
    newer = await client.get(f"/v1/team/announcements?after={message['id']}", headers=ravi)
    assert newer.json() == []
    unread = await _announcements(client, ravi)
    assert unread["unread"] == 1 and unread["lastMessagePreview"].startswith("📣 Office closed")


async def test_kudos_name_a_teammate_and_email_them(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, ids = await _company(client, mailbox)
    general = (
        await client.post("/v1/team/channels", headers=asha, json={"name": "general"})
    ).json()
    mailbox.messages.clear()
    given = await client.post(
        f"/v1/team/spaces/{general['id']}/posts",
        headers={**asha, **_key("k-1")},
        json={
            "kind": "kudos",
            "body": "Closed the Jaipur order a week early.",
            "kudos_to": ids["ravi@example.com"],
            "kudos_value": "Customer first",
        },
    )
    assert given.status_code == 201, given.text
    kudos = given.json()["kudos"]
    assert kudos["to"]["id"] == ids["ravi@example.com"] and kudos["value"] == "Customer first"
    assert [address for address, _, _ in mailbox.messages] == ["ravi@example.com"]

    to_self = await client.post(
        f"/v1/team/spaces/{general['id']}/posts",
        headers={**asha, **_key("k-2")},
        json={"kind": "kudos", "body": "Me!", "kudos_to": ids["asha@example.com"]},
    )
    assert to_self.status_code == 422
    not_announcer = await client.post(
        f"/v1/team/spaces/{general['id']}/posts",
        headers={**asha, **_key("k-3")},
        json={"kind": "announcement", "body": "Hello all"},
    )
    assert not_announcer.status_code == 403


async def test_polls_count_one_vote_each_and_close(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, ravi, _ = await _company(client, mailbox)
    general = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "general"})
    ).json()
    poll = (
        await client.post(
            f"/v1/team/spaces/{general['id']}/posts",
            headers={**owner.headers, **_key("p-1")},
            json={"kind": "poll", "body": "Where for Diwali?", "options": ["Terrace", "Cafe"]},
        )
    ).json()
    assert [option["text"] for option in poll["poll"]["options"]] == ["Terrace", "Cafe"]

    for headers, choice in ((asha, "1"), (ravi, "2"), (asha, "2")):
        voted = await client.post(
            f"/v1/team/messages/{poll['id']}/respond", headers=headers, json={"value": choice}
        )
        assert voted.status_code == 200, voted.text
    result = voted.json()["poll"]
    assert result["total"] == 2 and result["myVote"] == "2"
    assert [option["votes"] for option in result["options"]] == [0, 2]

    bad = await client.post(
        f"/v1/team/messages/{poll['id']}/respond", headers=asha, json={"value": "9"}
    )
    assert bad.status_code == 422
    one_option = await client.post(
        f"/v1/team/spaces/{general['id']}/posts",
        headers={**owner.headers, **_key("p-2")},
        json={"kind": "poll", "body": "Only one?", "options": ["Yes", "Yes"]},
    )
    assert one_option.status_code == 422


async def test_events_take_going_maybe_or_no(client: httpx.AsyncClient, mailbox: Mailbox) -> None:
    owner, asha, ravi, _ = await _company(client, mailbox)
    general = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "general"})
    ).json()
    starts = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    event = (
        await client.post(
            f"/v1/team/spaces/{general['id']}/posts",
            headers={**owner.headers, **_key("e-1")},
            json={
                "kind": "event",
                "title": "Diwali party",
                "body": "Sweets and music.",
                "starts_at": starts,
                "place": "Terrace",
            },
        )
    ).json()
    assert event["event"]["place"] == "Terrace" and event["title"] == "Diwali party"
    await client.post(
        f"/v1/team/messages/{event['id']}/respond", headers=asha, json={"value": "going"}
    )
    answered = await client.post(
        f"/v1/team/messages/{event['id']}/respond", headers=ravi, json={"value": "maybe"}
    )
    counts = answered.json()["event"]
    assert (counts["going"], counts["maybe"], counts["declined"], counts["mine"]) == (
        1,
        1,
        0,
        "maybe",
    )
    wrong = await client.post(
        f"/v1/team/messages/{event['id']}/respond", headers=ravi, json={"value": "later"}
    )
    assert wrong.status_code == 422
