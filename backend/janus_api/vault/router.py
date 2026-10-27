"""Vendor bank accounts: requested, then approved by someone else, then used for payment.

The full account number is encrypted on the way in and never sent back. Every request, approval and
rejection is written to the audit log. Each endpoint needs billing:manage, because bank details
decide where money goes.
"""

import re
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import aliased

from janus_api.audit import service as audit
from janus_api.auth.models import User
from janus_api.auth.service import Actor
from janus_api.core.deps import Db, request_ip, require
from janus_api.core.errors import ApiError
from janus_api.core.security import cipher
from janus_api.vault.models import VendorBankAccount

router = APIRouter(prefix="/v1", tags=["Vendor bank accounts"])
Billing = Annotated[Actor, Depends(require("billing:manage"))]

ACCOUNT_PATTERN = re.compile(r"^\d{9,18}$")
IFSC_PATTERN = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


class BankAccountRequest(BaseModel):
    vendor_id: str = Field(min_length=1, max_length=80)
    vendor_name: str = Field(min_length=2, max_length=160)
    holder: str = Field(min_length=2, max_length=160)
    account: str = Field(min_length=9, max_length=30)
    ifsc: str = Field(min_length=11, max_length=11)


class RejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class BankAccountOut(BaseModel):
    id: str
    vendor_id: str
    vendor_name: str
    holder: str
    masked_account: str
    ifsc: str
    status: str
    requested_by: str
    approved_by: str | None
    created_at: datetime
    decided_at: datetime | None


def _out(row: VendorBankAccount, requester: str, approver: str | None) -> BankAccountOut:
    return BankAccountOut(
        id=str(row.id),
        vendor_id=row.vendor_id,
        vendor_name=row.vendor_name,
        holder=row.holder,
        masked_account=f"••••{row.account_last4}",
        ifsc=row.ifsc,
        status=row.status,
        requested_by=requester,
        approved_by=approver,
        created_at=row.created_at,
        decided_at=row.decided_at,
    )


async def _load(db: Db, actor: Actor, account_id: int) -> VendorBankAccount:
    row = await db.scalar(
        select(VendorBankAccount).where(
            VendorBankAccount.id == account_id,
            VendorBankAccount.tenant_id == actor.session.tenant_id,
        )
    )
    if row is None:
        raise ApiError("not_found", "Bank request not found.", 404)
    return row


@router.get("/vendor-bank-accounts", response_model=list[BankAccountOut])
async def list_accounts(actor: Billing, db: Db) -> list[BankAccountOut]:
    requester = aliased(User)
    approver = aliased(User)
    rows = await db.execute(
        select(VendorBankAccount, requester.name, approver.name)
        .join(requester, requester.id == VendorBankAccount.requested_by)
        .outerjoin(approver, approver.id == VendorBankAccount.approved_by)
        .where(VendorBankAccount.tenant_id == actor.session.tenant_id)
        .order_by(VendorBankAccount.id.desc())
    )
    return [_out(row, who, by) for row, who, by in rows.all()]


@router.post("/vendor-bank-accounts", response_model=BankAccountOut, status_code=201)
async def request_change(
    data: BankAccountRequest, actor: Billing, db: Db, request: Request
) -> BankAccountOut:
    account = data.account.replace(" ", "")
    ifsc = data.ifsc.upper()
    if not ACCOUNT_PATTERN.match(account):
        raise ApiError("invalid_account", "A bank account number has 9 to 18 digits.", 422)
    if not IFSC_PATTERN.match(ifsc):
        raise ApiError("invalid_ifsc", "An IFSC code looks like HDFC0001234.", 422)
    pending = await db.scalar(
        select(VendorBankAccount.id).where(
            VendorBankAccount.tenant_id == actor.session.tenant_id,
            VendorBankAccount.vendor_id == data.vendor_id,
            VendorBankAccount.status == "pending",
        )
    )
    if pending is not None:
        raise ApiError("already_pending", "This vendor already has a bank change waiting.", 409)
    row = VendorBankAccount(
        tenant_id=actor.session.tenant_id,
        vendor_id=data.vendor_id,
        vendor_name=data.vendor_name.strip(),
        holder=data.holder.strip(),
        account_last4=account[-4:],
        account_ciphertext=cipher().encrypt(account.encode()).decode(),
        ifsc=ifsc,
        status="pending",
        requested_by=actor.user.id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    audit.record(
        db,
        "vendor_bank.requested",
        user_id=actor.user.id,
        tenant_id=actor.session.tenant_id,
        ip=request_ip(request),
        details={"vendor_id": data.vendor_id, "request_id": row.id},
    )
    return _out(row, actor.user.name, None)


@router.post("/vendor-bank-accounts/{account_id}/approve", response_model=BankAccountOut)
async def approve(account_id: int, actor: Billing, db: Db, request: Request) -> BankAccountOut:
    row = await _load(db, actor, account_id)
    if row.status != "pending":
        raise ApiError("not_pending", "Only a pending bank change can be approved.", 409)
    if row.requested_by == actor.user.id:
        raise ApiError(
            "self_approval", "The person who requested a bank change cannot approve it.", 403
        )
    row.status = "approved"
    row.approved_by = actor.user.id
    row.decided_at = datetime.now().astimezone()
    audit.record(
        db,
        "vendor_bank.approved",
        user_id=actor.user.id,
        tenant_id=actor.session.tenant_id,
        ip=request_ip(request),
        details={"vendor_id": row.vendor_id, "request_id": row.id},
    )
    await db.flush()
    return await _out_with_names(db, row)


@router.post("/vendor-bank-accounts/{account_id}/reject", response_model=BankAccountOut)
async def reject(
    account_id: int, data: RejectRequest, actor: Billing, db: Db, request: Request
) -> BankAccountOut:
    row = await _load(db, actor, account_id)
    if row.status != "pending":
        raise ApiError("not_pending", "Only a pending bank change can be rejected.", 409)
    row.status = "rejected"
    row.approved_by = actor.user.id
    row.decided_at = datetime.now().astimezone()
    audit.record(
        db,
        "vendor_bank.rejected",
        user_id=actor.user.id,
        tenant_id=actor.session.tenant_id,
        ip=request_ip(request),
        details={"vendor_id": row.vendor_id, "request_id": row.id, "reason": data.reason.strip()},
    )
    await db.flush()
    return await _out_with_names(db, row)


async def _out_with_names(db: Db, row: VendorBankAccount) -> BankAccountOut:
    requester = await db.scalar(select(User.name).where(User.id == row.requested_by))
    approver = (
        await db.scalar(select(User.name).where(User.id == row.approved_by))
        if row.approved_by
        else None
    )
    return _out(row, requester or "", approver)
