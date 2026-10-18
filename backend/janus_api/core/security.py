import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from cryptography.fernet import Fernet
from starlette.concurrency import run_in_threadpool

from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))
COMMON_PASSWORDS = frozenset(
    word.casefold()
    for word in Path(__file__)
    .with_name("data")
    .joinpath("common-passwords.txt")
    .read_text()
    .splitlines()
    if word
)


def now() -> datetime:
    return datetime.now(UTC)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def random_token() -> str:
    return secrets.token_urlsafe(32)


def validate_password(value: str) -> str:
    if not 8 <= len(value) <= 128 or value.casefold() in COMMON_PASSWORDS:
        raise ValueError("Use 8–128 characters and avoid common passwords.")
    return value


async def hash_password(value: str) -> str:
    return await run_in_threadpool(hasher.hash, value)


async def verify_password(stored: str, value: str) -> bool:
    try:
        return await run_in_threadpool(hasher.verify, stored, value)
    except (VerificationError, InvalidHashError):
        return False


def access_token(user_id: int, tenant_id: int, session_id: int) -> str:
    return jwt.encode(
        {
            "sub": str(user_id),
            "tenant_id": str(tenant_id),
            "sid": str(session_id),
            "iat": now(),
            "exp": now() + timedelta(minutes=15),
            "iss": "janus",
            "aud": "janus-api",
            "type": "access",
        },
        get_settings().jwt_secret.get_secret_value(),
        algorithm="HS256",
    )


def decode_access(token: str) -> tuple[int, int, int]:
    try:
        claims = jwt.decode(
            token,
            get_settings().jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            audience="janus-api",
            issuer="janus",
            options={"require": ["exp", "iat", "sub", "sid", "tenant_id", "type"]},
        )
        if claims["type"] != "access":
            raise ValueError
        ids = int(claims["sub"]), int(claims["tenant_id"]), int(claims["sid"])
        if any(value <= 0 or value > 2**63 - 1 for value in ids):
            raise ValueError
        return ids
    except (jwt.PyJWTError, ValueError, TypeError) as error:
        raise ApiError("unauthorized", "Invalid or expired session.", 401) from error


def cipher() -> Fernet:
    try:
        return Fernet(get_settings().encryption_key.get_secret_value().encode())
    except (ValueError, TypeError) as error:
        raise ApiError(
            "encryption_unavailable", "Secret encryption is not configured.", 503
        ) from error
