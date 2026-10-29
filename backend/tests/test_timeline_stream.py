import json

import httpx
import pytest

from janus_api.timeline import router as timeline_router
from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

KEY = "prj-stream"


def _entries(body: str) -> list[dict[str, str]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        if lines.get("event") == "entry":
            events.append({"id": lines["id"], **json.loads(lines["data"])})
    return events


@pytest.fixture
def short_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    # The stream normally stays open for minutes; a short one lets the test read it to the end.
    monkeypatch.setattr(timeline_router, "STREAM_SECONDS", 1.5)
    monkeypatch.setattr(timeline_router, "POLL_SECONDS", 0.1)


async def _timeline_with_two_messages(client: httpx.AsyncClient, mailbox: Mailbox):
    owner = await signup(client, mailbox)
    await client.post(
        "/v1/project-timelines", headers=owner.headers, json={"project_key": KEY, "name": "Stream"}
    )
    first = await client.post(
        f"/v1/project-timelines/{KEY}/entries",
        headers=owner.headers,
        json={"body": "First note", "decision": False},
    )
    await client.post(
        f"/v1/project-timelines/{KEY}/entries",
        headers=owner.headers,
        json={"body": "Second note", "decision": False},
    )
    return owner, first.json()["id"]


async def test_new_entries_are_pushed_in_order(
    client: httpx.AsyncClient, mailbox: Mailbox, short_stream: None
) -> None:
    owner, _ = await _timeline_with_two_messages(client, mailbox)
    response = await client.get(f"/v1/project-timelines/{KEY}/stream", headers=owner.headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _entries(response.text)
    assert [e["body"] for e in events] == ["First note", "Second note"]
    assert [e["id"] for e in events] == sorted(e["id"] for e in events)


async def test_reconnecting_resumes_after_the_last_event_seen(
    client: httpx.AsyncClient, mailbox: Mailbox, short_stream: None
) -> None:
    owner, first_id = await _timeline_with_two_messages(client, mailbox)
    response = await client.get(
        f"/v1/project-timelines/{KEY}/stream",
        headers={**owner.headers, "Last-Event-ID": first_id},
    )
    assert [e["body"] for e in _entries(response.text)] == ["Second note"]


async def test_strangers_and_anonymous_callers_get_nothing(
    client: httpx.AsyncClient, mailbox: Mailbox, short_stream: None
) -> None:
    owner, _ = await _timeline_with_two_messages(client, mailbox)
    outsider = await accept_new(client, await invite(client, mailbox, owner, "out@example.com"))
    stranger = await client.get(f"/v1/project-timelines/{KEY}/stream", headers=outsider)
    assert stranger.status_code == 404
    anonymous = await client.get(f"/v1/project-timelines/{KEY}/stream")
    assert anonymous.status_code == 401
