from datetime import date, timedelta
from decimal import Decimal

import httpx
import pytest

from janus_api.hr.payroll import Person, annual_income_tax, professional_tax, slip
from tests.conftest import Mailbox
from tests.helpers import accept_new, invite, signup


def _months(start: date, end: date) -> list[date]:
    out, cursor = [], start
    while cursor <= end:
        out.append(cursor)
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
    return out


@pytest.mark.parametrize(
    ("gross", "tax"),
    [(600000, 0), (1275000, 0), (1280000, 5200), (1500000, 97500), (2500000, 319800)],
)
def test_new_regime_tax_with_the_rebate_and_marginal_relief(gross: int, tax: int) -> None:
    assert annual_income_tax(gross) == tax


def test_tds_over_a_year_adds_up_to_the_years_tax_after_a_late_join_and_a_raise() -> None:
    # Joins on 16 July at ₹1.5 lakh a month, raised to ₹2 lakh from December.
    person = Person(
        key="emp-1",
        name="Asha",
        branch="Pune",
        pan="ABCDE1234F",
        regime="new",
        joined=date(2026, 7, 16),
        left=None,
        salary_now=200000,
        history=[(date(2026, 7, 1), 150000), (date(2026, 12, 1), 200000)],
    )
    earlier: dict[date, tuple[int, int]] = {}
    paid, deducted = 0, 0
    for month in _months(date(2026, 4, 1), date(2027, 3, 1)):
        made = slip(person, month, earlier)
        if made is None:
            assert month < date(2026, 7, 1)  # not yet joined
            continue
        assert made.tds is not None and made.note == ""
        earlier[month] = (made.gross, made.tds)
        paid += made.gross
        deducted += made.tds
        if month == date(2026, 7, 1):
            assert (made.paid_days, made.total_days) == (16, 31)
            assert made.gross == 77419  # 16 of 31 days of ₹1.5 lakh
            assert made.pt == 200 and made.pf == 1800 and made.esi == 0
    # What was paid: 16 days of July, Aug–Nov at ₹1.5 lakh, Dec–Mar at ₹2 lakh.
    assert paid == 77419 + 4 * 150000 + 4 * 200000
    # By March the TDS deducted is the year's tax on what was paid, give or take rounding.
    assert abs(deducted - annual_income_tax(paid)) <= 12
    # February's professional tax in Maharashtra is ₹300.
    assert professional_tax("Pune", 200000, date(2027, 2, 1)) == 300


def test_earlier_months_without_a_run_count_as_deducted_and_old_regime_is_left_out() -> None:
    person = Person("emp-2", "Ravi", "Delhi", None, "new", date(2020, 1, 1), None, 200000)
    october = slip(person, date(2026, 10, 1), {})
    assert october is not None and october.tds == 24375
    assert "6 earlier months" in october.note
    old = Person("emp-3", "Meena", "Delhi", None, "old", date(2020, 1, 1), None, 200000)
    kept = slip(old, date(2026, 10, 1), {})
    assert kept is not None and kept.tds is None and "accountant" in kept.note
    assert kept.net == kept.gross - kept.pf - kept.esi - kept.pt


def test_a_person_who_leaves_is_paid_to_their_last_day_and_bears_the_rest_of_the_tax() -> None:
    person = Person(
        "emp-4", "Karan", "Delhi", None, "new", date(2020, 1, 1), date(2026, 10, 15), 200000
    )
    october = slip(person, date(2026, 10, 1), {})
    assert october is not None and october.paid_days == 15
    assert slip(person, date(2026, 11, 1), {}) is None
    # No months left after October, so the tax not yet covered falls in October.
    paid = 6 * 200000 + october.gross
    year_tax = annual_income_tax(paid)
    # Each earlier month's share is rounded on its own, as on its payslip.
    share = int((Decimal(year_tax) * 200000 / paid).quantize(Decimal(1), rounding="ROUND_HALF_UP"))
    assert october.tds == year_tax - 6 * share


async def _seed(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    seeded = await client.post(
        "/v1/hr/records/seed",
        headers=headers,
        json={
            "records": {
                "employee": [
                    {
                        "id": "emp-1",
                        "name": "Asha Rao",
                        "email": "asha@example.com",
                        "title": "Designer",
                        "department": "Design",
                        "managerId": None,
                        "status": "active",
                        "branch": "Pune",
                        "joiningDate": "2020-01-01",
                        "salaryMonthly": 100000,
                    },
                    {
                        "id": "emp-2",
                        "name": "Meena Iyer",
                        "email": "meena@example.com",
                        "title": "Accountant",
                        "department": "Finance",
                        "managerId": None,
                        "status": "active",
                        "branch": "Delhi",
                        "joiningDate": "2020-01-01",
                        "salaryMonthly": 18000,
                        "taxRegime": "old",
                    },
                ]
            }
        },
    )
    assert seeded.status_code in (200, 201), seeded.text


async def test_a_month_is_run_once_posted_with_its_tds_and_pay_stays_private(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    owner = await signup(client, mailbox)
    await _seed(client, owner.headers)
    company = str(owner.tenant_id)
    today = date.today()
    last = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    url = f"/v1/portfolio/companies/{company}/payroll"

    preview = (await client.get(f"{url}/{last:%Y-%m}", headers=owner.headers)).json()
    assert preview["kept"] is False and preview["headcount"] == 2
    people = {item["name"]: item for item in preview["people"]}
    assert people["Meena Iyer"]["tds"] is None
    assert people["Meena Iyer"]["esi"] == "135.00"  # ₹18,000 gross is under the ESI limit
    assert people["Asha Rao"]["pt"] == "200.00"
    assert any("old tax regime" in note for note in preview["notes"])
    this_month = await client.get(f"{url}/{today:%Y-%m}", headers=owner.headers)
    assert this_month.status_code == 422

    posted = await client.post(url, headers=owner.headers, json={"month": f"{last:%Y-%m}"})
    assert posted.status_code == 201 and posted.json() == {"posted": True}
    kept = (await client.get(f"{url}/{last:%Y-%m}", headers=owner.headers)).json()
    assert kept["kept"] is True and kept["tds"] == people["Asha Rao"]["tds"]
    summary = (await client.get("/v1/portfolio/summary", headers=owner.headers)).json()
    tds = summary["companies"][0]["tds"]
    if tds and tds["label"] == f"{last:%b %Y}":
        assert tds["onSalaries"] == kept["tds"]

    # A raise after the run does not change the month that was run.
    await client.post(
        "/v1/hr/records/seed",
        headers=owner.headers,
        json={
            "records": {
                "employee": [
                    {
                        "id": "emp-1",
                        "name": "Asha Rao",
                        "email": "asha@example.com",
                        "title": "Designer",
                        "department": "Design",
                        "managerId": None,
                        "status": "active",
                        "branch": "Pune",
                        "joiningDate": "2020-01-01",
                        "salaryMonthly": 150000,
                    }
                ]
            }
        },
    )
    again = (await client.get(f"{url}/{last:%Y-%m}", headers=owner.headers)).json()
    assert again["gross"] == kept["gross"]
    assert (
        await client.post(url, headers=owner.headers, json={"month": f"{last:%Y-%m}"})
    ).json() == {"posted": False}

    # A finance manager sees the totals, not each person's pay.
    finance = await accept_new(
        client, await invite(client, mailbox, owner, "fm@example.com", role="finance_manager")
    )
    seen = (await client.get(f"{url}/{last:%Y-%m}", headers=finance)).json()
    assert seen["people"] is None and seen["gross"] == kept["gross"]
