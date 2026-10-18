from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.auth.service import Actor, authenticate
from janus_api.core.db import transaction
from janus_api.core.errors import ApiError
from janus_api.org.service import PERMISSIONS

# Commit or roll back before an HTTP response is sent.
Db = Annotated[AsyncSession, Depends(transaction, scope="function")]
bearer = HTTPBearer(auto_error=False)
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def request_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def request_device(request: Request) -> str:
    return request.headers.get("user-agent", "Unknown device")[:512]


async def current_actor(db: Db, credentials: Credentials) -> Actor:
    if credentials is None:
        raise ApiError("unauthorized", "Sign in to continue.", 401)
    return await authenticate(db, credentials.credentials)


CurrentActor = Annotated[Actor, Depends(current_actor)]


def require(permission: str) -> Callable[..., Coroutine[Any, Any, Actor]]:
    if permission not in PERMISSIONS:
        raise ValueError(f"Unknown permission: {permission}")

    async def check(actor: CurrentActor) -> Actor:
        if permission not in actor.permissions:
            raise ApiError("forbidden", "You do not have permission for this action.", 403)
        if permission in {"members:manage", "sources:manage"} and not actor.user.email_verified_at:
            raise ApiError("email_unverified", "Verify your email before this action.", 403)
        return actor

    return check
