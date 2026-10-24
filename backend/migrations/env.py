import asyncio
import re

from alembic import context
from sqlalchemy import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from janus_api.ai import models as ai_models
from janus_api.audit import models as audit_models
from janus_api.auth import models as auth_models
from janus_api.business import models as business_models
from janus_api.core.config import get_settings
from janus_api.core.db import Base
from janus_api.crm import models as crm_models
from janus_api.org import models as org_models
from janus_api.sources import models as source_models
from janus_api.whatsapp import models as whatsapp_models
from janus_api.worker import models as worker_models

assert (
    ai_models
    and auth_models
    and org_models
    and audit_models
    and crm_models
    and source_models
    and worker_models
    and whatsapp_models
    and business_models
)


def include_name(name: str | None, type_: str, parent_names: object) -> bool:
    return not (type_ == "table" and name and re.fullmatch(r"raw_events_\d{8}", name))


def run(connection: Connection) -> None:
    context.configure(
        connection=connection, target_metadata=Base.metadata, include_name=include_name
    )
    with context.begin_transaction():
        context.run_migrations()


async def migrate() -> None:
    url = get_settings().migration_database_url
    if not url:
        raise RuntimeError("JANUS_MIGRATION_DATABASE_URL is required for migrations")
    engine = create_async_engine(url)
    async with engine.connect() as connection:
        await connection.run_sync(run)
    await engine.dispose()


asyncio.run(migrate())
