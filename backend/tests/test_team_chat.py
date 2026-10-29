import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


def _key(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


async def _two_members(client: httpx.AsyncClient, mailbox: Mailbox):
    owner = await signup(client, mailbox)
    token = await invite(client, mailbox, owner, "asha@example.com")
    asha_headers = await accept_new(client, token)
    token = await invite(client, mailbox, owner, "ravi@example.com")
    ravi_headers = await accept_new(client, token)
    members = (await client.get("/v1/members", headers=owner.headers)).json()
    ids = {item["email"]: int(item["user_id"]) for item in members}
    return owner, asha_headers, ravi_headers, ids


async def test_a_member_creates_a_channel_and_others_see_and_join_it(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, _ = await _two_members(client, mailbox)
    created = await client.post(
        "/v1/team/channels",
        headers=owner.headers,
        json={"name": "sales-floor", "topic": "Daily targets"},
    )
    assert created.status_code == 201, created.text
    channel = created.json()
    assert channel["name"] == "sales-floor" and channel["joined"] is True

    listed = (await client.get("/v1/team/channels", headers=asha)).json()
    assert [item["name"] for item in listed] == ["sales-floor"]
    assert listed[0]["joined"] is False and listed[0]["memberCount"] == 1

    joined = await client.post(f"/v1/team/channels/{channel['id']}/join", headers=asha)
    assert joined.status_code == 200 and joined.json()["joined"] is True
    assert joined.json()["memberCount"] == 2


async def test_a_channel_name_must_be_unique_and_well_formed(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, _, _ = await _two_members(client, mailbox)
    first = await client.post("/v1/team/channels", headers=owner.headers, json={"name": "ops"})
    assert first.status_code == 201
    again = await client.post("/v1/team/channels", headers=owner.headers, json={"name": "ops"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "channel_exists"
    for bad in ["Ops Room", "-ops", "x", "ops_room"]:
        refused = await client.post("/v1/team/channels", headers=owner.headers, json={"name": bad})
        assert refused.status_code == 422, bad


async def test_posting_needs_a_join_and_replies_stay_in_their_thread(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, _ = await _two_members(client, mailbox)
    channel = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "general"})
    ).json()
    space = channel["id"]

    refused = await client.post(
        f"/v1/team/spaces/{space}/messages",
        headers={**asha, **_key("m-1")},
        json={"body": "Hello team"},
    )
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "not_joined"

    await client.post(f"/v1/team/channels/{space}/join", headers=asha)
    posted = await client.post(
        f"/v1/team/spaces/{space}/messages",
        headers={**owner.headers, **_key("m-2")},
        json={"body": "  Morning all  "},
    )
    assert posted.status_code == 201 and posted.json()["body"] == "Morning all"
    root = posted.json()["id"]

    reply = await client.post(
        f"/v1/team/spaces/{space}/messages",
        headers={**asha, **_key("m-3")},
        json={"body": "On it", "parent_id": int(root)},
    )
    assert reply.status_code == 201 and reply.json()["parentId"] == root

    deeper = await client.post(
        f"/v1/team/spaces/{space}/messages",
        headers={**owner.headers, **_key("m-4")},
        json={"body": "Nested", "parent_id": int(reply.json()["id"])},
    )
    assert deeper.status_code == 422 and deeper.json()["error"]["code"] == "thread_depth"

    listed = (await client.get(f"/v1/team/spaces/{space}/messages", headers=owner.headers)).json()
    assert [item["body"] for item in listed] == ["Morning all"]
    assert listed[0]["replyCount"] == 1

    thread = (await client.get(f"/v1/team/messages/{root}/replies", headers=owner.headers)).json()
    assert [item["body"] for item in thread] == ["On it"]


async def test_a_retry_with_the_same_key_does_not_post_twice(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, _, _ = await _two_members(client, mailbox)
    channel = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "retry"})
    ).json()
    headers = {**owner.headers, **_key("same-key")}
    first = await client.post(
        f"/v1/team/spaces/{channel['id']}/messages", headers=headers, json={"body": "once"}
    )
    second = await client.post(
        f"/v1/team/spaces/{channel['id']}/messages", headers=headers, json={"body": "once"}
    )
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    listed = (
        await client.get(f"/v1/team/spaces/{channel['id']}/messages", headers=owner.headers)
    ).json()
    assert len(listed) == 1


async def test_a_direct_conversation_is_private_to_its_two_members(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, ravi, ids = await _two_members(client, mailbox)
    opened = await client.post(
        "/v1/team/conversations", headers=asha, json={"user_id": ids["owner@example.com"]}
    )
    assert opened.status_code == 201, opened.text
    space = opened.json()["id"]
    assert opened.json()["peer"]["name"] == "Owner"

    again = await client.post(
        "/v1/team/conversations", headers=owner.headers, json={"user_id": ids["asha@example.com"]}
    )
    assert again.status_code == 200 and again.json()["id"] == space

    sent = await client.post(
        f"/v1/team/spaces/{space}/messages",
        headers={**asha, **_key("dm-1")},
        json={"body": "Can you check the Mumbai order?"},
    )
    assert sent.status_code == 201

    outsider = await client.get(f"/v1/team/spaces/{space}/messages", headers=ravi)
    assert outsider.status_code == 404
    outsider_send = await client.post(
        f"/v1/team/spaces/{space}/messages",
        headers={**ravi, **_key("dm-2")},
        json={"body": "Can I read this?"},
    )
    assert outsider_send.status_code == 404

    unread = (await client.get("/v1/team/conversations", headers=owner.headers)).json()
    assert unread[0]["unread"] == 1 and unread[0]["lastMessagePreview"].startswith("Can you")


async def test_you_cannot_open_a_conversation_with_yourself_or_a_stranger(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, ids = await _two_members(client, mailbox)
    self_chat = await client.post(
        "/v1/team/conversations", headers=owner.headers, json={"user_id": ids["owner@example.com"]}
    )
    assert self_chat.status_code == 422
    stranger = await client.post("/v1/team/conversations", headers=asha, json={"user_id": 999999})
    assert stranger.status_code == 404 and stranger.json()["error"]["code"] == "person_not_found"


async def test_only_the_author_can_edit_or_delete_and_reactions_toggle(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, _ = await _two_members(client, mailbox)
    channel = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "edits"})
    ).json()
    space = channel["id"]
    await client.post(f"/v1/team/channels/{space}/join", headers=asha)
    message = (
        await client.post(
            f"/v1/team/spaces/{space}/messages",
            headers={**owner.headers, **_key("e-1")},
            json={"body": "Draft"},
        )
    ).json()
    mid = message["id"]

    not_mine = await client.patch(
        f"/v1/team/messages/{mid}", headers=asha, json={"body": "Hijacked"}
    )
    assert not_mine.status_code == 403
    edited = await client.patch(
        f"/v1/team/messages/{mid}", headers=owner.headers, json={"body": "Final"}
    )
    assert edited.status_code == 200 and edited.json()["body"] == "Final"
    assert edited.json()["editedAt"] is not None

    liked = await client.post(
        f"/v1/team/messages/{mid}/reactions", headers=asha, json={"emoji": "👍"}
    )
    assert liked.json()["reactions"] == [{"emoji": "👍", "count": 1, "mine": True}]
    again = await client.post(
        f"/v1/team/messages/{mid}/reactions", headers=asha, json={"emoji": "👍"}
    )
    assert again.json()["reactions"][0]["count"] == 1
    removed = await client.post(
        f"/v1/team/messages/{mid}/reactions/remove", headers=asha, json={"emoji": "👍"}
    )
    assert removed.json()["reactions"] == []

    bad_emoji = await client.post(
        f"/v1/team/messages/{mid}/reactions", headers=asha, json={"emoji": "🦄"}
    )
    assert bad_emoji.status_code == 422

    deleted = await client.delete(f"/v1/team/messages/{mid}", headers=owner.headers)
    assert deleted.json()["deleted"] is True and deleted.json()["body"] is None
    listed = (await client.get(f"/v1/team/spaces/{space}/messages", headers=asha)).json()
    assert listed[0]["deleted"] is True and listed[0]["body"] is None


async def test_leaving_a_channel_stops_posting_but_keeps_reading(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, _ = await _two_members(client, mailbox)
    space = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "leave-me"})
    ).json()["id"]
    await client.post(f"/v1/team/channels/{space}/join", headers=asha)
    left = await client.post(f"/v1/team/channels/{space}/leave", headers=asha)
    assert left.json()["joined"] is False
    refused = await client.post(
        f"/v1/team/spaces/{space}/messages", headers={**asha, **_key("l-1")}, json={"body": "Hi"}
    )
    assert refused.status_code == 403
    readable = await client.get(f"/v1/team/spaces/{space}/messages", headers=asha)
    assert readable.status_code == 200


async def test_read_position_clears_unread_for_the_reader(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, ids = await _two_members(client, mailbox)
    space = (
        await client.post(
            "/v1/team/conversations",
            headers=owner.headers,
            json={"user_id": ids["asha@example.com"]},
        )
    ).json()["id"]
    last = None
    for index in range(3):
        sent = await client.post(
            f"/v1/team/spaces/{space}/messages",
            headers={**owner.headers, **_key(f"r-{index}")},
            json={"body": f"note {index}"},
        )
        last = sent.json()["id"]
    before = (await client.get("/v1/team/conversations", headers=asha)).json()
    assert before[0]["unread"] == 3
    marked = await client.post(
        f"/v1/team/spaces/{space}/read", headers=asha, json={"last_message_id": int(last)}
    )
    assert marked.status_code == 204
    after = (await client.get("/v1/team/conversations", headers=asha)).json()
    assert after[0]["unread"] == 0


async def test_every_member_can_list_the_people_they_can_message(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, _ = await _two_members(client, mailbox)
    people = (await client.get("/v1/team/people", headers=asha)).json()
    assert sorted(person["name"] for person in people) == ["Member", "Member", "Owner"]
