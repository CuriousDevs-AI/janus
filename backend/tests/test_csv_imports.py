import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from janus_api.core.db import session_factory
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.sources.csv_imports import parse_rows
from janus_api.worker.service import run_once
from tests.conftest import Mailbox
from tests.helpers import signup
from tests.test_ingestion import source
from tests.test_ingestion import worker_factory as worker_factory


async def test_csv_upload_worker_and_isolation(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    worker_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await signup(client, mailbox)
    other = await signup(client, mailbox, "other@example.com")
    connection = await source(
        client,
        owner,
        connectionKind="csv",
        fieldMapping=[
            {"rawField": "Full Name", "mapsTo": "name"},
            {"rawField": "Phone.No", "mapsTo": "phone"},
        ],
    )
    assert connection["source"] == "csv_import" and connection["signingSecret"] is None
    url = connection["ingestUrl"]
    headers = {**owner.headers, "Content-Type": "text/csv", "Idempotency-Key": "october-list"}
    body = (
        '\ufeffFull Name,Phone.No\r\n"Asha, Sharma",9876543210\r\nAsha,+919876543210\r\nBad,123\r\n'
    ).encode()
    result = await client.post(url, headers=headers, content=body)
    assert result.status_code == 202, result.text
    batch = result.json()
    assert batch["pendingRows"] == batch["totalRows"] == 3 and not batch["duplicate"]
    assert (await client.get("/v1/leads", headers=owner.headers)).json() == []
    repeated = await client.post(url, headers=headers, content=body)
    assert repeated.json()["duplicate"] and repeated.json()["id"] == batch["id"]
    assert (
        await client.post(url, headers=headers, content=body + b"New,9876543211\n")
    ).status_code == 409
    for _ in range(3):
        assert await run_once(worker_factory)
    assert not await run_once(worker_factory)
    status_url = f"{url}/{batch['id']}"
    status = (await client.get(status_url, headers=owner.headers)).json()
    assert (status["processedRows"], status["failedRows"], status["pendingRows"]) == (2, 1, 0)
    assert status["status"] == "completed_with_errors"
    rows = (await client.get(status_url + "/rows", headers=owner.headers)).json()
    assert [row["rowNumber"] for row in rows] == [2, 3, 4]
    assert rows[0]["customerId"] == rows[1]["customerId"]
    assert rows[2]["reason"] == "invalid_phone"
    leads = (await client.get("/v1/leads", headers=owner.headers)).json()
    assert len(leads) == 2 and all(lead["source"] == "csv_import" for lead in leads)
    contact = (
        await client.get(f"/v1/contacts/{rows[0]['customerId']}", headers=owner.headers)
    ).json()
    assert contact["name"] == "Asha, Sharma" and contact["phone"] == "+919876543210"
    for path in [url, status_url, status_url + "/rows"]:
        assert (await client.get(path, headers=other.headers)).status_code == 404
    assert (
        await client.post(url, headers={**headers, **other.headers}, content=body)
    ).status_code == 404
    async with session_factory()() as db:
        await set_context(db, tenant_id=other.tenant_id, user_id=other.user_id)
        assert await db.scalar(text("SELECT count(*) FROM csv_imports")) == 0
    # Structural errors reject the entire upload before any row is queued.
    invalid = await client.post(
        url,
        headers={**headers, "Idempotency-Key": "bad-file"},
        content=b"Full Name,Phone.No\nAsha,9876543210\nBroken\n",
    )
    assert invalid.status_code == 422
    assert len((await client.get(url, headers=owner.headers)).json()) == 1
    assert not await run_once(worker_factory)


def test_csv_format_limits() -> None:
    mapping = [{"rawField": "phone", "mapsTo": "phone"}]
    assert (
        parse_rows(b'phone,note\n9876543210,"line one\nline two"\n', mapping)[0][1]["note"]
        == "line one\nline two"
    )
    for body in [
        b"",
        b"phone\n",
        b"phone,phone\n1,2\n",
        b"name\nAsha\n",
        b"phone\n\xff",
        b"phone\n\x00",
        b'phone\n"unterminated',
        b"phone\n" + b"9876543210\n" * 1001,
    ]:
        with pytest.raises(ApiError) as error:
            parse_rows(body, mapping)
        assert error.value.code == "invalid_csv"
