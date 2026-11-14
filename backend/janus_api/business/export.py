"""A copy of the business's own records, for its Owner: one ZIP of spreadsheets (CSV).

What goes in is a fixed list of the business's records: customers and sales, money, people, stock,
projects, support and its company details. What never goes in: passwords, sign-in and API keys,
encrypted secrets and bank account numbers, and the team's chat, which is people's own messages.
Each export is written to the audit log with who made it.
"""

import csv
import io
import json
import re
import zipfile
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Table, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.auth.models import User
from janus_api.core.db import Base
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.org.models import Membership, Role, Tenant
from janus_api.org.service import membership

# Folder in the ZIP, then the tables that go in it. A table missing here is not exported.
SECTIONS: dict[str, tuple[str, ...]] = {
    "sales": ("leads", "contacts", "deals", "customer_calls"),
    "finance": (
        "finance_invoices",
        "finance_invoice_lines",
        "finance_payments",
        "finance_credit_notes",
        "finance_bills",
        "finance_bill_payments",
        "finance_bank_lines",
        "finance_budget_lines",
        "finance_budget_movements",
        "finance_fund_requests",
        "finance_payroll_postings",
        "finance_history_customers",
        "finance_history_months",
        "vendor_bank_accounts",
    ),
    "people": ("hr_payslips",),
    "stock": (
        "ops_items",
        "ops_batches",
        "ops_movements",
        "ops_adjustments",
        "ops_counts",
        "ops_count_lines",
        "ops_purchase_orders",
        "ops_po_lines",
        "ops_requisitions",
        "ops_dispatches",
        "ops_dispatch_lines",
        "ops_returns",
        "ops_transfers",
    ),
    "projects": (
        "projects",
        "project_milestones",
        "project_tasks",
        "project_timesheets",
        "project_allocations",
        "project_change_requests",
    ),
    "support": ("support_tickets", "whatsapp_conversations", "whatsapp_messages", "it_changes"),
    "company": (
        "company_registrations",
        "compliance_profiles",
        "compliance_filings",
        "company_documents",
        "company_rules",
        "portfolio_targets",
        "portfolio_knowledge",
        "automation_workflows",
    ),
}
# Columns that are never written out, by name: secrets, sign-in material, encrypted values and
# the internal keys that only stop a request being saved twice.
HIDDEN = re.compile(
    r"(secret|password|token|_hash$|hash_|encrypted|ciphertext|idempotency_key|callback|tenant_id$)"
)
README = """Your business's records from Janus
====================================

Exported {when} by {who} for {company}.

Each folder holds spreadsheets (CSV) that open in Excel, Google Sheets or Numbers:

  sales/      leads, contacts, deals and calls
  finance/    invoices, payments, credit notes, bills, bank lines, budgets and payroll postings
  people/     employees, leave, attendance and the rest of HR (one file per kind), and payslips
  stock/      items, batches, stock movements, purchase orders, dispatches, returns and transfers
  projects/   projects, milestones, tasks, timesheets and change requests
  support/    support tickets and WhatsApp conversations
  company/    registration, filings, documents (their details; the files stay in Janus), rules
  members.csv everyone with access, with their role
  app-data/   the rest of what the workspaces keep, as JSON

Amounts ending in _paise are in paise: divide by 100 for rupees.

Not included, on purpose: passwords, sign-in and API keys, encrypted secrets and bank account
numbers, and your team's chat messages.
"""


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, dict | list):
        return json.dumps(_scrub(value), ensure_ascii=False, default=str)
    return str(value)


def _scrub(value: Any) -> Any:
    """The same value with any secret-looking key removed, at any depth."""
    if isinstance(value, dict):
        return {key: _scrub(item) for key, item in value.items() if not HIDDEN.search(str(key))}
    if isinstance(value, list):
        return [_scrub(item) for item in value]
    return value


def _csv(header: list[str], rows: list[list[str]]) -> bytes:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(header)
    writer.writerows(rows)
    # With a byte-order mark, Excel reads ₹ and Indian names correctly.
    return ("﻿" + out.getvalue()).encode()


# Records that point at a contact also carry who it is, so the sheet reads on its own.
WITH_CONTACT = {"leads", "customer_calls"}


async def _table(db: AsyncSession, table: Table, tenant_id: int) -> tuple[bytes, int] | None:
    if "tenant_id" not in table.columns:
        return None
    columns = [column for column in table.columns if not HIDDEN.search(column.name)]
    header = [column.name for column in columns]
    query = select(*columns).where(table.c.tenant_id == tenant_id)
    if table.name in WITH_CONTACT:
        contacts = Base.metadata.tables["contacts"]
        extra = [contacts.c.name, contacts.c.phone_e164, contacts.c.email, contacts.c.company]
        query = query.add_columns(*extra).outerjoin(contacts, contacts.c.id == table.c.contact_id)
        header += ["contact_name", "contact_phone", "contact_email", "contact_company"]
    if "id" in table.columns:
        query = query.order_by(table.c.id)
    rows = [[_cell(value) for value in row] for row in await db.execute(query)]
    return _csv(header, rows), len(rows)


def _records(rows: list[dict[str, Any]]) -> bytes:
    """Records kept as documents (HR's), one row each, a column per field."""
    header: list[str] = []
    for item in rows:
        header += [key for key in item if key not in header]
    return _csv(header, [[_cell(item.get(key)) for key in header] for item in rows])


async def build(db: AsyncSession, tenant_id: int, user_id: int, ip: str) -> tuple[str, bytes]:
    """The ZIP's file name and bytes. Only the business's Owner may export it."""
    _, role = await membership(db, user_id, tenant_id)
    if role.name != "owner":
        raise ApiError("forbidden", "Only the business's Owner can export all of its records.", 403)
    tenant = await db.get(Tenant, tenant_id)
    user = await db.get(User, user_id)
    if tenant is None or user is None:
        raise ApiError("not_found", "Business not found.", 404)
    tables = Base.metadata.tables
    counts: dict[str, int] = {}
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        stamp = now()
        archive.writestr(
            "README.txt",
            README.format(
                when=stamp.strftime("%d %b %Y, %H:%M UTC"), who=user.name, company=tenant.name
            ),
        )
        for folder, names in SECTIONS.items():
            for name in names:
                table = tables.get(name)
                if table is None:
                    continue
                found = await _table(db, table, tenant_id)
                if found is None:
                    continue
                archive.writestr(f"{folder}/{name}.csv", found[0])
                counts[name] = found[1]
        # HR keeps each employee, leave request and day's attendance as a document.
        hr = tables["hr_records"]
        by_kind: dict[str, list[dict[str, Any]]] = {}
        for row in await db.execute(
            select(hr.c.kind, hr.c.key, hr.c.data, hr.c.updated_at)
            .where(hr.c.tenant_id == tenant_id)
            .order_by(hr.c.kind, hr.c.key)
        ):
            by_kind.setdefault(row.kind, []).append(
                {"key": row.key, **(row.data or {}), "updated_at": row.updated_at}
            )
        for kind, items in by_kind.items():
            archive.writestr(f"people/{kind}.csv", _records(_scrub(items)))
            counts[f"hr_{kind}"] = len(items)
        people = await db.execute(
            select(User.name, User.email, Role.name.label("role"), Membership.status)
            .join(Membership, Membership.user_id == User.id)
            .join(Role, Role.id == Membership.role_id)
            .where(Membership.tenant_id == tenant_id)
            .order_by(User.name)
        )
        archive.writestr(
            "members.csv",
            _csv(["name", "email", "role", "status"], [[_cell(v) for v in row] for row in people]),
        )
        state = tables["workspace_state"]
        for row in await db.execute(
            select(state.c.store_key, state.c.data).where(state.c.tenant_id == tenant_id)
        ):
            archive.writestr(
                f"app-data/{row.store_key}.json",
                json.dumps(_scrub(row.data), ensure_ascii=False, indent=1, default=str),
            )
    record(
        db,
        "business.exported",
        tenant_id=tenant_id,
        user_id=user_id,
        ip=ip,
        details={"rows": str(sum(counts.values()))},
    )
    slug = re.sub(r"[^a-z0-9]+", "-", tenant.name.lower()).strip("-") or "business"
    return f"{slug}-janus-export-{now().date().isoformat()}.zip", buffer.getvalue()
