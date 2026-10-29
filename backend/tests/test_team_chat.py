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


PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


async def test_a_member_posts_a_file_and_others_download_it_safely(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, _ = await _two_members(client, mailbox)
    space = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "files"})
    ).json()["id"]
    await client.post(f"/v1/team/channels/{space}/join", headers=asha)
    sent = await client.post(
        f"/v1/team/spaces/{space}/files",
        headers={**owner.headers, **_key("f-1")},
        data={"body": "Floor plan"},
        files={"file": ("plan.png", PNG, "image/png")},
    )
    assert sent.status_code == 201, sent.text
    attachment = sent.json()["attachments"][0]
    assert attachment["filename"] == "plan.png" and attachment["isImage"] is True
    assert attachment["contentType"] == "image/png" and attachment["sizeBytes"] == len(PNG)

    download = await client.get(f"/v1/team/attachments/{attachment['id']}", headers=asha)
    assert download.status_code == 200 and download.content == PNG
    assert download.headers["content-type"] == "image/png"
    assert download.headers["x-content-type-options"] == "nosniff"
    assert download.headers["content-disposition"].startswith("inline")


async def test_a_file_must_match_its_extension_and_size_limits(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, _, _ = await _two_members(client, mailbox)
    space = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "checks"})
    ).json()["id"]

    fake = await client.post(
        f"/v1/team/spaces/{space}/files",
        headers={**owner.headers, **_key("f-fake")},
        files={"file": ("evil.png", b"<script>alert(1)</script>", "image/png")},
    )
    assert fake.status_code == 422 and fake.json()["error"]["code"] == "file_type_not_allowed"

    unknown = await client.post(
        f"/v1/team/spaces/{space}/files",
        headers={**owner.headers, **_key("f-exe")},
        files={"file": ("tool.exe", b"MZ" + b"0" * 10, "application/octet-stream")},
    )
    assert unknown.status_code == 422

    too_big = await client.post(
        f"/v1/team/spaces/{space}/files",
        headers={**owner.headers, **_key("f-big")},
        files={"file": ("big.txt", b"a" * (5 * 1024 * 1024 + 1), "text/plain")},
    )
    assert too_big.status_code == 413 and too_big.json()["error"]["code"] == "file_too_large"


async def test_a_file_needs_a_join_and_a_direct_file_stays_between_its_members(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, ravi, ids = await _two_members(client, mailbox)
    space = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "join-first"})
    ).json()["id"]
    refused = await client.post(
        f"/v1/team/spaces/{space}/files",
        headers={**asha, **_key("f-nojoin")},
        files={"file": ("a.png", PNG, "image/png")},
    )
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "not_joined"

    dm = (
        await client.post(
            "/v1/team/conversations", headers=asha, json={"user_id": ids["owner@example.com"]}
        )
    ).json()["id"]
    sent = await client.post(
        f"/v1/team/spaces/{dm}/files",
        headers={**asha, **_key("f-dm")},
        files={"file": ("contract.pdf", b"%PDF-1.4 test", "application/pdf")},
    )
    assert sent.status_code == 201
    file_id = sent.json()["attachments"][0]["id"]
    assert (
        await client.get(f"/v1/team/attachments/{file_id}", headers=owner.headers)
    ).status_code == 200
    outsider = await client.get(f"/v1/team/attachments/{file_id}", headers=ravi)
    assert outsider.status_code == 404


async def test_a_retried_file_post_does_not_send_twice(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, _, _ = await _two_members(client, mailbox)
    space = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "retry-file"})
    ).json()["id"]
    headers = {**owner.headers, **_key("f-same")}
    first = await client.post(
        f"/v1/team/spaces/{space}/files",
        headers=headers,
        files={"file": ("n.txt", b"note", "text/plain")},
    )
    second = await client.post(
        f"/v1/team/spaces/{space}/files",
        headers=headers,
        files={"file": ("n.txt", b"note", "text/plain")},
    )
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]


async def test_a_deleted_message_takes_its_file_with_it(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, _, _ = await _two_members(client, mailbox)
    space = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "gone"})
    ).json()["id"]
    sent = await client.post(
        f"/v1/team/spaces/{space}/files",
        headers={**owner.headers, **_key("f-gone")},
        files={"file": ("gone.txt", b"bye", "text/plain")},
    )
    file_id = sent.json()["attachments"][0]["id"]
    await client.delete(f"/v1/team/messages/{sent.json()['id']}", headers=owner.headers)
    assert (
        await client.get(f"/v1/team/attachments/{file_id}", headers=owner.headers)
    ).status_code == 404


async def test_search_finds_channel_messages_and_only_your_own_conversations(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, ravi, ids = await _two_members(client, mailbox)
    channel = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "searchable"})
    ).json()["id"]
    await client.post(
        f"/v1/team/spaces/{channel}/messages",
        headers={**owner.headers, **_key("s-1")},
        json={"body": "Invoice for the Mumbai order is ready"},
    )
    dm = (
        await client.post(
            "/v1/team/conversations", headers=asha, json={"user_id": ids["owner@example.com"]}
        )
    ).json()["id"]
    await client.post(
        f"/v1/team/spaces/{dm}/messages",
        headers={**asha, **_key("s-2")},
        json={"body": "Private: the Mumbai contract terms"},
    )

    found = (await client.get("/v1/team/search", headers=asha, params={"q": "mumbai"})).json()
    labels = sorted(hit["spaceLabel"] for hit in found)
    assert labels == ["#searchable", "Owner"]

    outsider = (await client.get("/v1/team/search", headers=ravi, params={"q": "mumbai"})).json()
    assert [hit["spaceLabel"] for hit in outsider] == ["#searchable"]

    short = await client.get("/v1/team/search", headers=ravi, params={"q": "m"})
    assert short.status_code == 422


async def test_search_treats_percent_and_underscore_as_plain_text(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, _, _ = await _two_members(client, mailbox)
    channel = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "literal"})
    ).json()["id"]
    for index, body in enumerate(
        ["Discount 100% today", "Discount 1000 today", "snake_case_name", "snakeXcaseXname"]
    ):
        await client.post(
            f"/v1/team/spaces/{channel}/messages",
            headers={**owner.headers, **_key(f"lit-{index}")},
            json={"body": body},
        )
    percent = (
        await client.get("/v1/team/search", headers=owner.headers, params={"q": "100%"})
    ).json()
    assert [hit["message"]["body"] for hit in percent] == ["Discount 100% today"]
    underscore = (
        await client.get("/v1/team/search", headers=owner.headers, params={"q": "snake_case"})
    ).json()
    assert [hit["message"]["body"] for hit in underscore] == ["snake_case_name"]


async def test_a_group_conversation_is_private_and_found_again_for_the_same_people(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, ravi, ids = await _two_members(client, mailbox)
    opened = await client.post(
        "/v1/team/conversations",
        headers=asha,
        json={"user_ids": [ids["owner@example.com"], ids["ravi@example.com"]]},
    )
    assert opened.status_code == 201, opened.text
    group = opened.json()
    assert group["kind"] == "group" and group["peer"] is None
    assert group["memberCount"] == 3 and "Owner" in group["title"]

    again = await client.post(
        "/v1/team/conversations",
        headers=asha,
        json={"user_ids": [ids["ravi@example.com"], ids["owner@example.com"]]},
    )
    assert again.status_code == 200 and again.json()["id"] == group["id"]

    sent = await client.post(
        f"/v1/team/spaces/{group['id']}/messages",
        headers={**asha, **_key("g-1")},
        json={"body": "Group plan for Friday"},
    )
    assert sent.status_code == 201
    seen = await client.get(f"/v1/team/spaces/{group['id']}/messages", headers=ravi)
    assert seen.status_code == 200 and seen.json()[0]["body"] == "Group plan for Friday"

    listed = (await client.get("/v1/team/conversations", headers=ravi)).json()
    assert [item["kind"] for item in listed] == ["group"]


async def test_a_group_needs_people_and_refuses_yourself(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, ids = await _two_members(client, mailbox)
    empty = await client.post("/v1/team/conversations", headers=asha, json={"user_ids": []})
    assert empty.status_code == 422
    with_self = await client.post(
        "/v1/team/conversations",
        headers=asha,
        json={"user_ids": [ids["owner@example.com"], ids["asha@example.com"]]},
    )
    assert with_self.status_code == 422
    stranger = await client.post(
        "/v1/team/conversations",
        headers=asha,
        json={"user_ids": [ids["owner@example.com"], 999999]},
    )
    assert stranger.status_code == 404


async def test_a_voice_call_tracks_who_is_in_it_and_relays_messages_between_them(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, ravi, ids = await _two_members(client, mailbox)
    created = await client.post(
        "/v1/team/channels", headers=owner.headers, json={"name": "standup", "voice": True}
    )
    assert created.status_code == 201, created.text
    voice = created.json()
    assert voice["kind"] == "voice" and voice["title"] == "standup" and voice["inCall"] == []
    space = voice["id"]

    joined = await client.post(f"/v1/team/voice/{space}/join", headers=asha)
    assert joined.status_code == 200
    assert [person["id"] for person in joined.json()["participants"]] == [ids["asha@example.com"]]
    await client.post(f"/v1/team/voice/{space}/join", headers=owner.headers)

    listed = (await client.get("/v1/team/channels", headers=ravi)).json()
    in_call = next(item for item in listed if item["id"] == space)["inCall"]
    assert len(in_call) == 2

    muted = await client.post(f"/v1/team/voice/{space}/state", headers=asha, json={"muted": True})
    mine = next(p for p in muted.json()["participants"] if p["id"] == ids["asha@example.com"])
    assert mine["muted"] is True and mine["sharing"] is False

    offer = await client.post(
        f"/v1/team/voice/{space}/signal",
        headers=asha,
        json={"to_user_id": ids["owner@example.com"], "kind": "offer", "payload": {"sdp": "v=0"}},
    )
    assert offer.status_code == 202, offer.text
    inbox = (await client.get(f"/v1/team/voice/{space}/signals", headers=owner.headers)).json()
    assert [(item["kind"], item["fromUserId"]) for item in inbox] == [
        ("offer", ids["asha@example.com"])
    ]
    assert inbox[0]["payload"] == {"sdp": "v=0"}

    to_outsider = await client.post(
        f"/v1/team/voice/{space}/signal",
        headers=asha,
        json={"to_user_id": ids["ravi@example.com"], "kind": "ice", "payload": {}},
    )
    assert to_outsider.status_code == 409
    assert to_outsider.json()["error"]["code"] == "peer_not_in_call"
    from_outsider = await client.post(
        f"/v1/team/voice/{space}/signal",
        headers=ravi,
        json={"to_user_id": ids["asha@example.com"], "kind": "ice", "payload": {}},
    )
    assert from_outsider.status_code == 409
    assert from_outsider.json()["error"]["code"] == "not_in_call"

    left = await client.post(f"/v1/team/voice/{space}/leave", headers=asha)
    assert [person["id"] for person in left.json()["participants"]] == [ids["owner@example.com"]]


async def test_a_voice_channel_takes_no_text_and_one_call_at_a_time(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, asha, _, _ = await _two_members(client, mailbox)
    first = (
        await client.post(
            "/v1/team/channels", headers=owner.headers, json={"name": "room-a", "voice": True}
        )
    ).json()["id"]
    second = (
        await client.post(
            "/v1/team/channels", headers=owner.headers, json={"name": "room-b", "voice": True}
        )
    ).json()["id"]
    text = await client.post(
        f"/v1/team/spaces/{first}/messages",
        headers={**owner.headers, **_key("v-1")},
        json={"body": "Hello"},
    )
    assert text.status_code == 422 and text.json()["error"]["code"] == "voice_channel"

    await client.post(f"/v1/team/voice/{first}/join", headers=asha)
    await client.post(f"/v1/team/voice/{second}/join", headers=asha)
    in_first = (await client.get(f"/v1/team/voice/{first}", headers=owner.headers)).json()
    in_second = (await client.get(f"/v1/team/voice/{second}", headers=owner.headers)).json()
    assert in_first["participants"] == [] and len(in_second["participants"]) == 1

    big = await client.post(
        f"/v1/team/voice/{second}/signal",
        headers=asha,
        json={"to_user_id": 1, "kind": "offer", "payload": {"sdp": "x" * 70000}},
    )
    assert big.status_code == 422

    not_voice = (
        await client.post("/v1/team/channels", headers=owner.headers, json={"name": "plain"})
    ).json()["id"]
    assert (await client.post(f"/v1/team/voice/{not_voice}/join", headers=asha)).status_code == 422
