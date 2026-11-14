import asyncio
import json
import logging
import signal

from sqlalchemy import text

from janus_api.auth import models as auth_models
from janus_api.business.engine import run_once as run_workflow_once
from janus_api.business.report_mail import run_once as report_once
from janus_api.core.db import check_database_role, session_factory
from janus_api.portfolio.alerts import add_owner_defaults
from janus_api.portfolio.alerts import run_once as alert_once
from janus_api.portfolio.digest import run_once as digest_once
from janus_api.whatsapp.worker import run_once as send_once
from janus_api.worker.service import run_once

DEFAULTS_EVERY = 600.0

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
    # Owners who never chose get the weekly email and red alerts; checked every ten minutes.
    defaults_due = 0.0
    try:
        while not stop.is_set():
            if loop.time() >= defaults_due:
                defaults_due = loop.time() + DEFAULTS_EVERY
                try:
                    await add_owner_defaults(factory)
                except Exception as error:
                    logging.getLogger("janus").error(
                        json.dumps(
                            {
                                "event": "owner_defaults_failed",
                                "exception_type": type(error).__name__,
                            }
                        )
                    )
            try:
                ingested = await run_once(factory)
                sent = await send_once(factory)
                ran = await run_workflow_once(factory)
                mailed = await digest_once(factory)
                alerted = await alert_once(factory)
                reported = await report_once(factory)
                if ingested or sent or ran or mailed or alerted or reported:
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
