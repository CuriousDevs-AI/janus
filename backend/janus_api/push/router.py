from fastapi import APIRouter, Response

from janus_api.core.deps import CurrentActor, Db
from janus_api.push import schemas, service

router = APIRouter(prefix="/v1/push", tags=["Push notifications"])


@router.get("/key", response_model=schemas.PushKeyOut)
async def key(actor: CurrentActor) -> schemas.PushKeyOut:
    return service.public_key()


@router.post("/subscriptions", status_code=204)
async def subscribe(data: schemas.SubscriptionIn, actor: CurrentActor, db: Db) -> Response:
    await service.subscribe(db, actor, data)
    return Response(status_code=204)


@router.post("/subscriptions/remove", status_code=204)
async def unsubscribe(data: schemas.Unsubscribe, actor: CurrentActor, db: Db) -> Response:
    await service.unsubscribe(db, actor, data.endpoint)
    return Response(status_code=204)
