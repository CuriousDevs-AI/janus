"""Web Push: notifications that reach a person's browser even when Janus is closed.

Each message is encrypted for one browser (RFC 8291, aes128gcm) and signed with the server's
VAPID key (RFC 8292), so the push service carries it without reading it. Only the push services
of the major browsers are accepted as endpoints, so a subscription cannot point the server at an
arbitrary address.
"""

import base64
import json
import logging
import os
import time
from urllib.parse import urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from janus_api.auth.service import Actor
from janus_api.core.config import get_settings
from janus_api.core.db import session_factory
from janus_api.core.deps import Db
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.org.models import Membership
from janus_api.push import schemas
from janus_api.push.models import PushSubscription

log = logging.getLogger(__name__)

PUSH_HOSTS = (
    "fcm.googleapis.com",
    "jmt17.google.com",  # Chromium builds' Google push endpoint
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
    ".push.apple.com",
    ".notify.windows.com",
)
RECORD_SIZE = 4096
TTL_SECONDS = 24 * 3600


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64url(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _private_key() -> ec.EllipticCurvePrivateKey | None:
    raw = get_settings().vapid_private_key.get_secret_value()
    if not raw:
        return None
    return ec.derive_private_key(int.from_bytes(unb64url(raw), "big"), ec.SECP256R1())


def _public_bytes(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )


def public_key() -> schemas.PushKeyOut:
    key = _private_key()
    return schemas.PushKeyOut(publicKey=b64url(_public_bytes(key.public_key())) if key else None)


def allowed_endpoint(endpoint: str) -> bool:
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or parts.username or parts.password or parts.port not in (None, 443):
        return False
    return any(
        host == name or (name.startswith(".") and host.endswith(name)) for name in PUSH_HOSTS
    )


def encrypt(
    payload: bytes,
    p256dh: str,
    auth: str,
    *,
    server_key: ec.EllipticCurvePrivateKey | None = None,
    salt: bytes | None = None,
) -> bytes:
    """RFC 8291 aes128gcm: one record, readable only with the browser's private key."""
    browser_public = unb64url(p256dh)
    browser_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), browser_public)
    server_key = server_key or ec.generate_private_key(ec.SECP256R1())
    server_public = _public_bytes(server_key.public_key())
    salt = salt or os.urandom(16)
    shared = server_key.exchange(ec.ECDH(), browser_key)
    ikm = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=unb64url(auth),
        info=b"WebPush: info\x00" + browser_public + server_public,
    ).derive(shared)

    def derive(info: bytes, length: int) -> bytes:
        return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)

    cek = derive(b"Content-Encoding: aes128gcm\x00", 16)
    nonce = derive(b"Content-Encoding: nonce\x00", 12)
    sealed = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    header = salt + RECORD_SIZE.to_bytes(4, "big") + bytes([len(server_public)]) + server_public
    return header + sealed


def _vapid_header(endpoint: str, key: ec.EllipticCurvePrivateKey) -> str:
    parts = urlsplit(endpoint)
    token = jwt.encode(
        {
            "aud": f"{parts.scheme}://{parts.netloc}",
            "exp": int(time.time()) + 12 * 3600,
            "sub": get_settings().vapid_subject,
        },
        key,
        algorithm="ES256",
    )
    return f"vapid t={token}, k={b64url(_public_bytes(key.public_key()))}"


async def subscribe(db: Db, actor: Actor, data: schemas.SubscriptionIn) -> None:
    if _private_key() is None:
        raise ApiError("push_off", "Push notifications are not set up on this server.", 409)
    if not allowed_endpoint(data.endpoint):
        raise ApiError("push_endpoint", "That is not a browser push service.", 422)
    try:
        point = unb64url(data.keys.p256dh)
        # A real browser key is a point on the P-256 curve, not just 65 bytes.
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), point)
        if len(point) != 65 or len(unb64url(data.keys.auth)) != 16:
            raise ValueError
    except ValueError as error:
        raise ApiError("push_keys", "The browser's push keys are not valid.", 422) from error
    # A browser that re-subscribes, or now belongs to someone else signed in, moves to them.
    await db.execute(
        insert(PushSubscription)
        .values(
            tenant_id=actor.session.tenant_id,
            user_id=actor.user.id,
            endpoint=data.endpoint,
            p256dh=data.keys.p256dh,
            auth=data.keys.auth,
        )
        .on_conflict_do_update(
            index_elements=["endpoint"],
            set_={
                "tenant_id": actor.session.tenant_id,
                "user_id": actor.user.id,
                "p256dh": data.keys.p256dh,
                "auth": data.keys.auth,
            },
        )
    )


async def unsubscribe(db: Db, actor: Actor, endpoint: str) -> None:
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == endpoint, PushSubscription.user_id == actor.user.id
        )
    )


async def send_to_people(
    tenant_id: int, user_ids: list[int] | None, exclude: int, message: dict[str, str]
) -> None:
    """Pushes one message to every browser of the given people (everyone when None).

    Runs after the request in its own session. A browser the push service no longer knows is
    forgotten; any other failure is logged and the rest still go.
    """
    key = _private_key()
    if key is None:
        return
    async with session_factory()() as db:
        await set_context(db, tenant_id=tenant_id)
        query = (
            select(PushSubscription)
            .join(
                Membership,
                (Membership.user_id == PushSubscription.user_id)
                & (Membership.tenant_id == PushSubscription.tenant_id),
            )
            .where(
                PushSubscription.tenant_id == tenant_id,
                PushSubscription.user_id != exclude,
                Membership.status == "active",
            )
        )
        if user_ids is not None:
            query = query.where(PushSubscription.user_id.in_(user_ids))
        rows = (await db.scalars(query)).all()
        payload = json.dumps(message).encode()
        gone: list[int] = []
        async with httpx.AsyncClient(timeout=10) as client:
            for row in rows:
                if not allowed_endpoint(row.endpoint):
                    gone.append(row.id)
                    continue
                try:
                    response = await client.post(
                        row.endpoint,
                        content=encrypt(payload, row.p256dh, row.auth),
                        headers={
                            "Authorization": _vapid_header(row.endpoint, key),
                            "Content-Encoding": "aes128gcm",
                            "Content-Type": "application/octet-stream",
                            "TTL": str(TTL_SECONDS),
                            "Urgency": "high",
                        },
                    )
                except httpx.HTTPError:
                    log.warning("push delivery failed", exc_info=True)
                    continue
                if response.status_code in (404, 410):
                    gone.append(row.id)
                elif response.status_code >= 400:
                    log.warning("push refused: %s %s", response.status_code, response.text[:200])
        if gone:
            await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(gone)))
        await db.commit()
