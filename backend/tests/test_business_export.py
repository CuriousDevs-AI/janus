import csv
import io
import zipfile

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup
from tests.test_hr_records import _employee


async def test_the_owner_exports_every_record_without_secrets(
    client: httpx.AsyncClient, mailbox: Mailbox, admin_engine: AsyncEngine
) -> None:
    owner = await signup(client, mailbox)
    admin = await accept_new(
        client, await invite(client, mailbox, owner, "admin@example.com", "admin")
    )
    lead = await client.post(
        "/v1/leads",
        headers={**owner.headers, "Idempotency-Key": "export-lead"},
        json={"name": "Meera Traders", "phone": "9876543210"},
    )
    assert lead.status_code == 201, lead.text
    seeded = await client.post(
        "/v1/hr/records/seed",
        headers=owner.headers,
        json={
            "records": {
                "employee": [_employee("emp-001", "Owner", "owner@example.com", None, 200000)]
            }
        },
    )
    assert seeded.status_code == 200, seeded.text

    # An admin manages the business but does not take a copy of all of it.
    assert (await client.get("/v1/business/export", headers=admin)).status_code == 403
    exported = await client.get("/v1/business/export", headers=owner.headers)
    assert exported.status_code == 200, exported.text
    assert exported.headers["content-type"] == "application/zip"
    assert "janus-export" in exported.headers["content-disposition"]

    archive = zipfile.ZipFile(io.BytesIO(exported.content))
    names = set(archive.namelist())
    assert {"README.txt", "members.csv", "sales/leads.csv", "people/employee.csv"} <= names

    def rows(name: str) -> list[dict[str, str]]:
        return list(csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig"))))

    assert [row["name"] for row in rows("sales/contacts.csv")] == ["Meera Traders"]
    leads = rows("sales/leads.csv")
    assert [(row["contact_name"], row["contact_phone"]) for row in leads] == [
        ("Meera Traders", "+919876543210")
    ]
    assert [row["email"] for row in rows("people/employee.csv")] == ["owner@example.com"]
    assert {row["email"] for row in rows("members.csv")} == {
        "owner@example.com",
        "admin@example.com",
    }
    for name in names:
        if name.endswith(".csv"):
            header = archive.read(name).decode("utf-8-sig").splitlines()[0]
            assert not any(
                word in header for word in ("password", "token", "secret", "_hash", "tenant_id")
            ), (name, header)

    async with admin_engine.connect() as connection:
        audited = await connection.scalar(
            text("SELECT count(*) FROM audit_log WHERE action = 'business.exported'")
        )
    assert audited == 1
