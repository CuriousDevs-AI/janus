from fastapi import APIRouter, Request

from janus_api.billing import schemas, service
from janus_api.core.deps import CurrentActor, Db, request_ip

router = APIRouter(prefix="/v1/billing", tags=["Billing"])


@router.get("", response_model=schemas.BillingOut)
async def read_billing(actor: CurrentActor, db: Db) -> schemas.BillingOut:
    return await service.view(db, actor.user.id, actor.session.tenant_id)


@router.put("/plan", response_model=schemas.BillingOut)
async def change_plan(
    data: schemas.PlanChange, actor: CurrentActor, db: Db, request: Request
) -> schemas.BillingOut:
    return await service.change_plan(
        db, actor.user.id, actor.session.tenant_id, data.plan, request_ip(request)
    )


@router.post("/sample-invoices", response_model=schemas.BillingOut)
async def sample_invoices(
    data: schemas.SampleInvoices, actor: CurrentActor, db: Db, request: Request
) -> schemas.BillingOut:
    return await service.add_sample_invoices(
        db, actor.user.id, actor.session.tenant_id, data.months, request_ip(request)
    )


@router.post("/checkout", response_model=schemas.CheckoutOut)
async def checkout(
    data: schemas.Checkout, actor: CurrentActor, db: Db, request: Request
) -> schemas.CheckoutOut:
    return await service.checkout(
        db, actor.user.id, actor.user.name, actor.user.email, data.plan, request_ip(request)
    )


@router.post("/checkout/verify", response_model=schemas.BillingOut)
async def verify(
    data: schemas.CheckoutVerify, actor: CurrentActor, db: Db, request: Request
) -> schemas.BillingOut:
    return await service.verify(
        db, actor.user.id, actor.session.tenant_id, data, request_ip(request)
    )


@router.post("/razorpay/webhook", status_code=204)
async def razorpay_webhook(request: Request, db: Db) -> None:
    await service.webhook(
        db,
        await request.body(),
        request.headers.get("x-razorpay-signature", ""),
        request_ip(request),
    )
