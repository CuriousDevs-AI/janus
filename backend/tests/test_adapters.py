import smtplib
from io import BytesIO
from unittest.mock import MagicMock

import boto3
import httpx
import pytest
from botocore.stub import ANY, Stubber
from PIL import Image
from pydantic import SecretStr, ValidationError

from janus_api.auth.service import authenticate
from janus_api.core import email, storage
from janus_api.core.config import Settings, get_settings
from janus_api.core.db import session_factory
from janus_api.core.deps import require
from janus_api.core.errors import ApiError
from tests.conftest import Mailbox
from tests.helpers import signup


async def test_s3_avatar_upload_persists_real_url(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    account = await signup(client, mailbox)
    settings = get_settings()
    monkeypatch.setattr(settings, "s3_bucket", "janus-test-avatars")
    monkeypatch.setattr(settings, "s3_public_base_url", "https://media.example.com")
    sdk = boto3.client(
        "s3", region_name="ap-south-1", aws_access_key_id="test", aws_secret_access_key="test"
    )
    stub = Stubber(sdk)
    stub.add_response(
        "put_object",
        {},
        {"Bucket": "janus-test-avatars", "Key": ANY, "Body": ANY, "ContentType": "image/jpeg"},
    )
    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: sdk)
    buffer = BytesIO()
    Image.new("RGB", (1200, 500), "blue").save(buffer, format="PNG")
    normalized = storage.normalize_image(buffer.getvalue())
    with Image.open(BytesIO(normalized)) as clean:
        assert clean.format == "JPEG" and max(clean.size) == 1024
    with stub:
        response = await client.post(
            "/v1/me/avatar",
            headers=account.headers,
            files={"file": ("avatar.png", buffer.getvalue(), "image/png")},
        )
        assert response.status_code == 200, response.text
        url = response.json()["avatar_url"]
        assert url.startswith(f"https://media.example.com/avatars/{account.user_id}/")
        assert url.endswith(".jpg")
        assert (await client.get("/v1/me", headers=account.headers)).json()["user"][
            "avatar_url"
        ] == url
        stub.assert_no_pending_responses()
    sdk.close()


async def test_smtp_uses_tls_and_short_plaintext_message(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_username", "smtp-user")
    monkeypatch.setattr(settings, "smtp_password", SecretStr("smtp-secret"))
    smtp = MagicMock()
    smtp.__enter__.return_value = smtp
    factory = MagicMock(return_value=smtp)
    monkeypatch.setattr(smtplib, "SMTP", factory)
    await email.SMTPEmailSender().send("user@example.com", "Verify your email", "Verification link")
    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with("smtp-user", "smtp-secret")
    message = smtp.send_message.call_args.args[0]
    assert message["To"] == "user@example.com" and message.get_content_type() == "text/plain"
    assert message.get_content().strip() == "Verification link"


async def test_delivery_failure_rolls_back_signup_and_forgot_stays_generic(
    client: httpx.AsyncClient,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    account = await signup(client, mailbox)

    class FailingSender:
        async def send(self, recipient: str, subject: str, body: str) -> None:
            raise ApiError("email_unavailable", "Email unavailable.", 503)

    monkeypatch.setattr(email, "get_sender", FailingSender)
    known = await client.post("/v1/auth/forgot-password", json={"email": account.email})
    unknown = await client.post("/v1/auth/forgot-password", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 200 and known.json() == unknown.json()
    body = {
        "name": "Owner",
        "email": "other@example.com",
        "password": "Safe-password!5913",
        "business_name": "Shop",
    }
    assert (await client.post("/v1/auth/signup", json=body)).status_code == 503
    monkeypatch.setattr(email, "get_sender", lambda: mailbox)
    assert (await client.post("/v1/auth/signup", json=body)).status_code == 201


async def test_sources_permission_requires_verified_email(
    client: httpx.AsyncClient, mailbox: Mailbox
) -> None:
    account = await signup(client, mailbox, verify=False)
    async with session_factory()() as db:
        actor = await authenticate(db, account.access)
        with pytest.raises(ApiError, match="Verify your email"):
            await require("sources:manage")(actor)


def test_production_cannot_print_email_tokens() -> None:
    with pytest.raises(ValidationError, match="Production requires SMTP"):
        Settings(
            database_url="postgresql+asyncpg://invalid",
            jwt_secret=SecretStr("x" * 32),
            environment="production",
            email_backend="console",
        )
