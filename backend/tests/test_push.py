import base64

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import SecretStr

from janus_api.core.config import Settings, get_settings
from janus_api.push import service
from tests.conftest import Mailbox
from tests.helpers import signup

# RFC 8291, Appendix A: the worked example of an encrypted push message.
RFC_PLAINTEXT = b"When I grow up, I want to be a watermelon"
RFC_SERVER_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"
RFC_BROWSER_PUBLIC = (
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
)
RFC_AUTH = "BTBZMqHH6r4Tts7J_aSIgg"
RFC_SALT = "DGv6ra1nlYgDCS1FRnbzlw"
RFC_BODY = (
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmY"
    "WAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexS"
    "gSxsj_Qulcy4a-fN"
)

FCM = "https://fcm.googleapis.com/fcm/send/abc123def456ghi789"
# A browser's keys: a P-256 public point (65 bytes) and a 16-byte auth secret.
P256DH = RFC_BROWSER_PUBLIC
AUTH = RFC_AUTH


def test_encryption_matches_the_rfc_8291_example() -> None:
    server_key = ec.derive_private_key(
        int.from_bytes(service.unb64url(RFC_SERVER_PRIVATE), "big"), ec.SECP256R1()
    )
    body = service.encrypt(
        RFC_PLAINTEXT,
        RFC_BROWSER_PUBLIC,
        RFC_AUTH,
        server_key=server_key,
        salt=service.unb64url(RFC_SALT),
    )
    assert service.b64url(body) == RFC_BODY


def test_only_browser_push_services_are_accepted() -> None:
    for good in [
        FCM,
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://web.push.apple.com/QGuQyavXutnMH",
        "https://db5p.notify.windows.com/w/?token=abc",
        "https://jmt17.google.com/fcm/send/abc",
    ]:
        assert service.allowed_endpoint(good), good
    for bad in [
        "http://fcm.googleapis.com/fcm/send/x",
        "https://169.254.169.254/latest/meta-data",
        "https://fcm.googleapis.com.evil.example/x",
        "https://user:pass@fcm.googleapis.com/x",
        "https://fcm.googleapis.com:8443/x",
        "https://localhost/x",
    ]:
        assert not service.allowed_endpoint(bad), bad


def test_settings_refuse_a_bad_push_key() -> None:
    base = {"database_url": "postgresql+asyncpg://x@y/z", "jwt_secret": "j" * 40}
    with pytest.raises(ValueError):
        Settings(**base, vapid_private_key=SecretStr("short"))
    with pytest.raises(ValueError):
        Settings(**base, vapid_subject="admin@example.com")
    assert Settings(**base, vapid_private_key=SecretStr(RFC_SERVER_PRIVATE))


async def test_push_is_off_until_a_key_is_set_then_a_browser_subscribes(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = await signup(client, mailbox)
    subscription = {"endpoint": FCM, "keys": {"p256dh": P256DH, "auth": AUTH}}
    monkeypatch.setattr(get_settings(), "vapid_private_key", SecretStr(""))
    assert (await client.get("/v1/push/key", headers=owner.headers)).json() == {"publicKey": None}
    off = await client.post("/v1/push/subscriptions", headers=owner.headers, json=subscription)
    assert off.status_code == 409

    monkeypatch.setattr(get_settings(), "vapid_private_key", SecretStr(RFC_SERVER_PRIVATE))
    key = (await client.get("/v1/push/key", headers=owner.headers)).json()["publicKey"]
    assert len(base64.urlsafe_b64decode(key + "==")) == 65
    saved = await client.post("/v1/push/subscriptions", headers=owner.headers, json=subscription)
    assert saved.status_code == 204, saved.text
    again = await client.post("/v1/push/subscriptions", headers=owner.headers, json=subscription)
    assert again.status_code == 204

    elsewhere = {**subscription, "endpoint": "https://169.254.169.254/latest/meta-data/xx"}
    refused = await client.post("/v1/push/subscriptions", headers=owner.headers, json=elsewhere)
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "push_endpoint"
    bad_keys = {**subscription, "keys": {"p256dh": "A" * 87, "auth": "B" * 22}}
    refused = await client.post("/v1/push/subscriptions", headers=owner.headers, json=bad_keys)
    assert refused.status_code == 422

    removed = await client.post(
        "/v1/push/subscriptions/remove", headers=owner.headers, json={"endpoint": FCM}
    )
    assert removed.status_code == 204


async def test_an_announcement_is_pushed_to_members_browsers(
    client: httpx.AsyncClient, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    from tests.helpers import accept_new, invite

    owner = await signup(client, mailbox)
    asha = await accept_new(client, await invite(client, mailbox, owner, "asha@example.com"))
    monkeypatch.setattr(get_settings(), "vapid_private_key", SecretStr(RFC_SERVER_PRIVATE))
    for headers, endpoint in ((owner.headers, FCM + "owner"), (asha, FCM + "asha")):
        saved = await client.post(
            "/v1/push/subscriptions",
            headers=headers,
            json={"endpoint": endpoint, "keys": {"p256dh": P256DH, "auth": AUTH}},
        )
        assert saved.status_code == 204

    sent: list[tuple[str, dict[str, str], int]] = []
    real_post = httpx.AsyncClient.post

    async def fake_post(self: httpx.AsyncClient, url: str, **kwargs: object) -> httpx.Response:
        # Only the push service is faked; the test's own requests to the API go through.
        if not str(url).startswith(FCM):
            return await real_post(self, url, **kwargs)  # type: ignore[arg-type]
        headers = kwargs["headers"]
        assert isinstance(headers, dict)
        content = kwargs["content"]
        assert isinstance(content, bytes)
        sent.append((url, headers, len(content)))
        return httpx.Response(410 if url.endswith("asha") else 201)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    channels = (await client.get("/v1/team/channels", headers=owner.headers)).json()
    space = next(item for item in channels if item["announcements"])
    posted = await client.post(
        f"/v1/team/spaces/{space['id']}/posts",
        headers={**owner.headers, "Idempotency-Key": "push-1"},
        json={"kind": "announcement", "title": "Holiday", "body": "Office closed Friday."},
    )
    assert posted.status_code == 201, posted.text
    # Only Asha's browser: the author is not pushed their own announcement.
    assert [url for url, _, _ in sent] == [FCM + "asha"]
    headers = sent[0][1]
    assert headers["Content-Encoding"] == "aes128gcm" and headers["TTL"]
    assert headers["Authorization"].startswith("vapid t=") and ", k=" in headers["Authorization"]
    # The push service said Asha's browser is gone (410), so it is forgotten.
    sent.clear()
    again = await client.post(
        f"/v1/team/spaces/{space['id']}/posts",
        headers={**owner.headers, "Idempotency-Key": "push-2"},
        json={"kind": "announcement", "body": "And Monday too."},
    )
    assert again.status_code == 201
    assert sent == []
