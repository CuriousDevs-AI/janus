from datetime import UTC, datetime, timedelta

import httpx

from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup

TODAY = datetime.now(UTC).date().isoformat()
LAST_WEEK = (datetime.now(UTC).date() - timedelta(days=7)).isoformat()


def _employee(key: str, name: str, email: str, manager: str | None, salary: int) -> dict:
    return {
        "id": key,
        "name": name,
        "email": email,
        "title": "Staff",
        "department": "Sales",
        "managerId": manager,
        "status": "active",
        "salaryMonthly": salary,
        "salaryHistory": [{"from": "2026-01-01", "salaryMonthly": salary - 1000}],
    }


def _leave(key: str, employee: str, manager: str, status: str = "pending") -> dict:
    return {
        "id": key,
        "employeeId": employee,
        "employeeName": "Someone",
        "managerId": manager,
        "type": "casual",
        "from": "2026-11-10",
        "to": "2026-11-11",
        "days": 2,
        "reason": "Family visit",
        "status": status,
        "step": "manager",
        "route": [{"kind": "person", "id": manager, "name": "Ravi", "label": "Manager"}],
        "level": 0,
    }


async def _company(client: httpx.AsyncClient, mailbox: Mailbox):
    owner = await signup(client, mailbox)
    ravi = await accept_new(
        client, await invite(client, mailbox, owner, "ravi@example.com", role="manager")
    )
    asha = await accept_new(client, await invite(client, mailbox, owner, "asha@example.com"))
    meera = await accept_new(client, await invite(client, mailbox, owner, "meera@example.com"))
    seeded = await client.post(
        "/v1/hr/records/seed",
        headers=owner.headers,
        json={
            "employee": [
                _employee("emp-001", "Owner", "owner@example.com", None, 200000),
                _employee("emp-002", "Ravi", "RAVI@example.com", "emp-001", 90000),
                _employee("emp-003", "Asha", "asha@example.com", "emp-002", 50000),
                _employee("emp-004", "Meera", "meera@example.com", "emp-001", 60000),
            ],
            "leave": [_leave("leave-meera", "emp-004", "emp-001")],
        },
    )
    assert seeded.status_code == 200, seeded.text
    return owner, ravi, asha, meera


async def _save(client, headers, kind, key, data, version=0):
    return await client.put(
        f"/v1/hr/records/{kind}/{key}",
        headers=headers,
        json={"data": data, "expected_version": version},
    )


async def test_everyone_sees_the_directory_but_only_their_own_pay(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, asha, _ = await _company(client, mailbox)
    mine = (await client.get("/v1/hr/records", headers=asha)).json()
    assert mine["me"] == "emp-003" and mine["admin"] is False
    pay = {item["key"]: item["data"]["salaryMonthly"] for item in mine["employee"]}
    assert pay == {"emp-001": 0, "emp-002": 0, "emp-003": 50000, "emp-004": 0}
    assert all(
        "salaryHistory" not in item["data"] for item in mine["employee"] if item["key"] != "emp-003"
    )
    assert mine["leave"] == []

    full = (await client.get("/v1/hr/records", headers=owner.headers)).json()
    assert full["admin"] is True and full["seeded"] is True
    assert {item["key"]: item["data"]["salaryMonthly"] for item in full["employee"]}[
        "emp-004"
    ] == 60000
    assert [item["key"] for item in full["leave"]] == ["leave-meera"]


async def test_leave_is_asked_for_yourself_and_decided_by_your_approver(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, ravi, asha, meera = await _company(client, mailbox)
    for_someone = await _save(
        client, asha, "leave", "leave-x", _leave("leave-x", "emp-004", "emp-002")
    )
    assert for_someone.status_code == 403
    pre_approved = await _save(
        client, asha, "leave", "leave-y", _leave("leave-y", "emp-003", "emp-002", "approved")
    )
    assert pre_approved.status_code == 422

    asked = await _save(client, asha, "leave", "leave-a", _leave("leave-a", "emp-003", "emp-002"))
    assert asked.status_code == 200, asked.text
    assert asked.json()["version"] == 1

    # Meera is not Asha's approver, so she neither sees nor decides it.
    theirs = (await client.get("/v1/hr/records", headers=meera)).json()["leave"]
    assert [item["key"] for item in theirs] == ["leave-meera"]
    sneaky = {**asked.json()["data"], "status": "approved"}
    assert (await _save(client, meera, "leave", "leave-a", sneaky, 1)).status_code == 403

    # Ravi, her manager, sees and approves it, but cannot change what she asked for.
    seen = (await client.get("/v1/hr/records", headers=ravi)).json()["leave"]
    assert [item["key"] for item in seen] == ["leave-a"]
    decision = {**asked.json()["data"], "status": "approved", "step": "complete", "days": 9}
    approved = await _save(client, ravi, "leave", "leave-a", decision, 1)
    assert approved.status_code == 200, approved.text
    assert approved.json()["data"]["status"] == "approved"
    assert approved.json()["data"]["days"] == 2

    # While pending, she can withdraw her own request.
    second = await _save(client, asha, "leave", "leave-b", _leave("leave-b", "emp-003", "emp-002"))
    withdrawn = {**second.json()["data"], "status": "rejected"}
    assert (await _save(client, asha, "leave", "leave-b", withdrawn, 1)).status_code == 200

    # Once decided, Asha cannot quietly change it back.
    undo = {**approved.json()["data"], "status": "pending"}
    assert (await _save(client, asha, "leave", "leave-a", undo, 2)).status_code == 409

    # A save from an old copy is refused, not written over the newer one.
    stale = await _save(client, owner.headers, "leave", "leave-a", decision, 1)
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "version_conflict"


async def test_only_hr_changes_employees_and_attendance_is_for_today(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, ravi, asha, _ = await _company(client, mailbox)
    raise_pay = _employee("emp-003", "Asha", "asha@example.com", "emp-002", 999999)
    assert (await _save(client, asha, "employee", "emp-003", raise_pay, 1)).status_code == 403
    assert (
        await client.delete("/v1/hr/records/leave/leave-meera", headers=asha)
    ).status_code == 403

    today = {"id": "att-1", "employeeId": "emp-003", "date": TODAY, "status": "present"}
    assert (await _save(client, asha, "attendance", "att-1", today)).status_code == 200
    past = {"id": "att-2", "employeeId": "emp-003", "date": LAST_WEEK, "status": "present"}
    assert (await _save(client, asha, "attendance", "att-2", past)).status_code == 403
    someone = {"id": "att-3", "employeeId": "emp-004", "date": TODAY, "status": "present"}
    assert (await _save(client, asha, "attendance", "att-3", someone)).status_code == 403
    # Her manager can correct a past day for her.
    fixed = await _save(client, ravi, "attendance", "att-2", past)
    assert fixed.status_code == 200, fixed.text

    edited = await _save(
        client,
        owner.headers,
        "employee",
        "emp-003",
        _employee("emp-003", "Asha K", "asha@example.com", "emp-002", 55000),
        1,
    )
    assert edited.status_code == 200 and edited.json()["data"]["salaryMonthly"] == 55000


async def test_the_first_upload_happens_once_and_only_by_hr(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, asha, _ = await _company(client, mailbox)
    again = await client.post("/v1/hr/records/seed", headers=owner.headers, json={"employee": []})
    assert again.status_code == 409
    refused = await client.post("/v1/hr/records/seed", headers=asha, json={"employee": []})
    assert refused.status_code == 403


async def test_a_member_without_an_employee_record_cannot_ask_for_leave(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, _, _, _ = await _company(client, mailbox)
    newcomer = await accept_new(client, await invite(client, mailbox, owner, "new@example.com"))
    seen = (await client.get("/v1/hr/records", headers=newcomer)).json()
    assert seen["me"] is None and len(seen["employee"]) == 4
    asked = await _save(
        client, newcomer, "leave", "leave-n", _leave("leave-n", "emp-009", "emp-001")
    )
    assert asked.status_code == 403 and asked.json()["error"]["code"] == "no_employee_record"
