import json
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path
from typing import Protocol
from urllib.parse import urlencode

from starlette.concurrency import run_in_threadpool

from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError


class EmailSender(Protocol):
    async def send(self, recipient: str, subject: str, body: str) -> None: ...


class ConsoleEmailSender:
    async def send(self, recipient: str, subject: str, body: str) -> None:
        print(
            json.dumps({"event": "dev_email", "to": recipient, "subject": subject, "body": body}),
            flush=True,
        )


class SMTPEmailSender:
    async def send(self, recipient: str, subject: str, body: str) -> None:
        settings = get_settings()
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = settings.email_from, recipient, subject
        message.set_content(body)

        def deliver() -> None:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                if settings.smtp_starttls:
                    smtp.starttls(context=ssl.create_default_context())
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
                smtp.send_message(message)

        try:
            await run_in_threadpool(deliver)
        except (smtplib.SMTPException, OSError) as error:
            raise ApiError(
                "email_unavailable", "Email delivery is temporarily unavailable.", 503
            ) from error


def get_sender() -> EmailSender:
    return SMTPEmailSender() if get_settings().email_backend == "smtp" else ConsoleEmailSender()


async def send_token(recipient: str, kind: str, token: str) -> None:
    subjects = {
        "verify-email": "Verify your Janus email",
        "reset-password": "Reset your Janus password",
        "change-email": "Confirm your new Janus email",
        "invite": "Join your team on Janus",
    }
    url = f"{get_settings().frontend_url.rstrip('/')}/{kind}?{urlencode({'token': token})}"
    template = Path(__file__).with_name("templates").joinpath(f"{kind}.txt").read_text()
    await get_sender().send(recipient, subjects[kind], template.format(url=url))
