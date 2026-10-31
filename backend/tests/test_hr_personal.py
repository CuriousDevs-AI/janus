import httpx

from tests.conftest import Mailbox
from tests.test_hr_records import _company, _save


async def _get(client: httpx.AsyncClient, headers: dict[str, str], kind: str) -> list[dict]:
    return (await client.get("/v1/hr/records", headers=headers)).json()["records"][kind]


async def test_expenses_are_submitted_by_the_person_and_decided_by_their_manager(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, ravi, asha, meera = await _company(client, mailbox)
    claim = {"id": "exp-1", "employeeId": "emp-003", "amount": 1200, "status": "manager_review"}
    assert (
        await _save(client, asha, "expense", "exp-1", {**claim, "status": "approved"})
    ).status_code == 422
    assert (await _save(client, asha, "expense", "exp-1", claim)).status_code == 200
    assert await _get(client, meera, "expense") == []

    receipt = {"id": "exp-1", "value": {"description": "Taxi", "date": "2026-10-30"}}
    assert (await _save(client, asha, "expense_evidence", "exp-1", receipt)).status_code == 200
    assert (await _save(client, meera, "expense_evidence", "exp-1", receipt, 1)).status_code == 403

    approved = await _save(
        client, ravi, "expense", "exp-1", {**claim, "status": "approved", "amount": 99999}, 1
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["data"]["status"] == "approved"
    assert approved.json()["data"]["amount"] == 1200
    paid = await _save(client, ravi, "expense", "exp-1", {**claim, "status": "paid"}, 2)
    assert paid.status_code == 403
    late_edit = await _save(client, asha, "expense", "exp-1", {**claim, "amount": 5000}, 2)
    assert late_edit.status_code == 403
    assert (
        await _save(client, owner.headers, "expense", "exp-1", {**claim, "status": "paid"}, 2)
    ).status_code == 200


async def test_corrections_can_be_withdrawn_while_they_wait(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    _, ravi, asha, _ = await _company(client, mailbox)
    fix = {"id": "reg-1", "employeeId": "emp-003", "date": "2026-10-20", "status": "pending"}
    assert (await _save(client, asha, "regularisation", "reg-1", fix)).status_code == 200
    assert (
        await client.delete("/v1/hr/records/regularisation/reg-1", headers=asha)
    ).status_code == 204

    fix = {**fix, "id": "reg-2"}
    assert (await _save(client, asha, "regularisation", "reg-2", fix)).status_code == 200
    decided = await _save(client, ravi, "regularisation", "reg-2", {**fix, "status": "approved"}, 1)
    assert decided.status_code == 200
    assert (
        await client.delete("/v1/hr/records/regularisation/reg-2", headers=asha)
    ).status_code == 403


async def test_reviews_documents_and_onboarding_tasks_take_only_their_own_fields(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, ravi, asha, _ = await _company(client, mailbox)
    review = {
        "id": "rev-1",
        "employeeId": "emp-003",
        "goal": "Grow sales",
        "progress": 10,
        "rating": None,
        "status": "in_review",
    }
    assert (await _save(client, owner.headers, "review", "rev-1", review)).status_code == 200
    mine = await _save(client, asha, "review", "rev-1", {**review, "progress": 60, "rating": 5}, 1)
    assert mine.status_code == 200
    assert (mine.json()["data"]["progress"], mine.json()["data"]["rating"]) == (60, None)
    rated = await _save(client, ravi, "review", "rev-1", {**mine.json()["data"], "rating": 4}, 2)
    assert rated.json()["data"]["rating"] == 4

    doc = {
        "id": "doc-1",
        "employeeId": "emp-003",
        "name": "Offer letter",
        "signatureStatus": "sent",
        "acknowledgedAt": None,
    }
    assert (await _save(client, owner.headers, "document", "doc-1", doc)).status_code == 200
    signed = await _save(
        client,
        asha,
        "document",
        "doc-1",
        {**doc, "signatureStatus": "signed", "name": "Raise to 1 crore"},
        1,
    )
    assert signed.json()["data"]["signatureStatus"] == "signed"
    assert signed.json()["data"]["name"] == "Offer letter"
    new_doc = await _save(client, asha, "document", "doc-2", {**doc, "id": "doc-2"})
    assert new_doc.status_code == 403

    own_task = {"id": "onb-1", "employeeId": "emp-003", "ownerRole": "employee", "status": "todo"}
    boss_task = {"id": "onb-2", "employeeId": "emp-003", "ownerRole": "manager", "status": "todo"}
    for task in (own_task, boss_task):
        assert (
            await _save(client, owner.headers, "onboarding", task["id"], task)
        ).status_code == 200
    assert (
        await _save(client, asha, "onboarding", "onb-1", {**own_task, "status": "done"}, 1)
    ).status_code == 200
    assert (
        await _save(client, asha, "onboarding", "onb-2", {**boss_task, "status": "done"}, 1)
    ).status_code == 403
    assert (
        await _save(client, ravi, "onboarding", "onb-2", {**boss_task, "status": "done"}, 1)
    ).status_code == 200


async def test_policy_acknowledgements_and_letters_are_asked_for_yourself(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    _, _, asha, _ = await _company(client, mailbox)
    ack = {"id": "policy-leave:1:emp-003", "value": "2026-10-31"}
    assert (await _save(client, asha, "acknowledgement", ack["id"], ack)).status_code == 200
    other = {"id": "policy-leave:1:emp-004", "value": "2026-10-31"}
    assert (await _save(client, asha, "acknowledgement", other["id"], other)).status_code == 403

    letter = {"id": "let-1", "employeeId": "emp-003", "type": "salary", "status": "pending"}
    assert (await _save(client, asha, "letter", "let-1", letter)).status_code == 200
    done = await _save(client, asha, "letter", "let-1", {**letter, "status": "completed"}, 1)
    assert done.status_code == 403


async def test_a_manager_proposes_a_change_without_seeing_current_pay(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner, ravi, asha, _ = await _company(client, mailbox)
    change = {
        "id": "chg-1",
        "employeeId": "emp-003",
        "kind": "salary_revision",
        "status": "pending_hr",
        "before": {"title": "Staff", "salaryMonthly": 0},
        "to": {"salaryMonthly": 60000},
    }
    proposed = await _save(client, ravi, "career", "chg-1", change)
    assert proposed.status_code == 200, proposed.text
    assert (await _get(client, ravi, "career"))[0]["data"]["before"]["salaryMonthly"] == 0
    assert (await _get(client, asha, "career"))[0]["data"]["before"]["salaryMonthly"] == 50000
    assert (await _get(client, owner.headers, "career"))[0]["data"]["to"]["salaryMonthly"] == 60000
    approved = await _save(client, ravi, "career", "chg-1", {**change, "status": "approved"}, 1)
    assert approved.status_code == 403
    own = await _save(client, asha, "career", "chg-2", {**change, "id": "chg-2"})
    assert own.status_code == 403
