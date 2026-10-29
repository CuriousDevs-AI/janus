from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from janus_api.core import email
from janus_api.core.config import get_settings
from janus_api.main import app


@dataclass
class Mailbox:
    messages: list[tuple[str, str, str]] = field(default_factory=list)

    async def send(self, recipient: str, subject: str, body: str) -> None:
        self.messages.append((recipient, subject, body))

    def token(self, recipient: str, kind: str) -> str:
        for address, _, body in reversed(self.messages):
            if address == recipient:
                for word in body.split():
                    if f"/{kind}?" in word:
                        return parse_qs(urlsplit(word).query)["token"][0]
        raise AssertionError(f"No {kind} email for {recipient}")


@pytest.fixture
def mailbox(monkeypatch: pytest.MonkeyPatch) -> Mailbox:
    mailbox = Mailbox()
    monkeypatch.setattr(email, "get_sender", lambda: mailbox)
    return mailbox


@pytest.fixture(scope="session")
async def admin_engine() -> AsyncIterator[AsyncEngine]:
    settings = get_settings()
    if settings.environment != "test" or not settings.migration_database_url:
        pytest.fail("Use an isolated database and set JANUS_ENVIRONMENT=test explicitly.")
    engine = create_async_engine(settings.migration_database_url)
    yield engine
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_database(admin_engine: AsyncEngine) -> AsyncIterator[None]:
    async with admin_engine.begin() as connection:
        await connection.execute(
            text(
                "TRUNCATE users, login_attempts, contacts, finance_budget_lines,"
                " finance_budget_movements, finance_invoices, finance_invoice_lines,"
                " finance_payments, finance_credit_notes, ops_items, ops_batches, ops_movements,"
                " ops_adjustments RESTART IDENTITY CASCADE"
            )
        )
        await connection.execute(text("DELETE FROM roles WHERE tenant_id IS NOT NULL"))
        await connection.execute(text("DELETE FROM teams"))
        await connection.execute(text("DELETE FROM tenants"))
    yield


@pytest.fixture
async def client(mailbox: Mailbox) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 12345)),
        base_url="http://test",
        headers={"user-agent": "Janus tests"},
    ) as client:
        yield client
