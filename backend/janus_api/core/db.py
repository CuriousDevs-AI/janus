from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy import BigInteger, Identity, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError


class Base(DeclarativeBase):
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)


@lru_cache
def session_factory() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    return async_sessionmaker(engine, expire_on_commit=False)


async def transaction() -> AsyncIterator[AsyncSession]:
    async with session_factory()() as db:
        try:
            yield db
            await db.commit()
        except ApiError as error:
            # Failed logins must keep their lockout counter and audit event.
            if error.commit:
                await db.commit()
            else:
                await db.rollback()
            raise
        except BaseException:
            await db.rollback()
            raise


async def check_database_role() -> None:
    async with session_factory()() as db:
        elevated = await db.scalar(
            text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")
        )
        if elevated:
            raise RuntimeError("The API database role must not be superuser or BYPASSRLS")
