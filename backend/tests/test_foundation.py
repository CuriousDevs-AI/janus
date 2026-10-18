from sqlalchemy import text

from janus_api.core.db import session_factory
from janus_api.core.tenancy import set_context


async def test_context_is_transaction_local() -> None:
    async with session_factory()() as db:
        await set_context(db, tenant_id=42, user_id=9)
        assert await db.scalar(text("SELECT app_tenant()")) == 42
        assert await db.scalar(text("SELECT app_user()")) == 9
        await db.commit()
        assert await db.scalar(text("SELECT app_tenant()")) is None
        assert await db.scalar(text("SELECT app_user()")) is None


async def test_runtime_role_cannot_bypass_rls() -> None:
    async with session_factory()() as db:
        assert await db.scalar(
            text(
                "SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname=current_user"
            )
        )


async def test_commit_failure_is_reported_before_success_response() -> None:
    import httpx
    from fastapi import FastAPI

    from janus_api.auth.models import LoginAttempt
    from janus_api.core.deps import Db
    from janus_api.core.errors import install_errors

    app = FastAPI()
    install_errors(app)

    @app.post("/commit")
    async def commit_failure(db: Db) -> dict[str, bool]:
        # Leave a required column unset: the real database rejects this during commit.
        db.add(LoginAttempt(email_hash="0" * 64))
        return {"ok": True}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/commit")
    assert response.status_code == 409 and response.json()["error"]["code"] == "conflict"
