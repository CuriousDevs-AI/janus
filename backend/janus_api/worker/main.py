import asyncio
import json
import logging
import signal

from sqlalchemy import text

from janus_api.auth import models as auth_models
from janus_api.core.db import check_database_role, session_factory
from janus_api.whatsapp.worker import run_once as send_once
from janus_api.worker.service import run_once

assert auth_models  # Register the users table referenced by lead ownership foreign keys.


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    await check_database_role()
    factory = session_factory()
    async with factory() as db:
        allowed = await db.scalar(
            text(
                "SELECT has_function_privilege(current_user, "
                "'public.claim_ingest_job()', 'EXECUTE')"
            )
        )
        if not allowed:
            raise RuntimeError("Worker requires the restricted janus_worker database role")
        await db.execute(text("SELECT public.ensure_raw_event_partitions()"))
        await db.commit()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    logging.getLogger("janus").info(json.dumps({"event": "worker_started"}))
    try:
        while not stop.is_set():
            try:
                ingested = await run_once(factory)
                sent = await send_once(factory)
                if ingested or sent:
                    continue
            except Exception as error:
                logging.getLogger("janus").error(
                    json.dumps(
                        {
                            "event": "worker_transaction_failed",
                            "exception_type": type(error).__name__,
                        }
                    )
                )
            try:
                await asyncio.wait_for(stop.wait(), timeout=1)
            except TimeoutError:
                pass
    finally:
        await factory.kw["bind"].dispose()


if __name__ == "__main__":
    asyncio.run(main())
