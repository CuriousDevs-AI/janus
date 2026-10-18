import json
import logging
from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from janus_api.core.errors import ProcessingError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context
from janus_api.worker.models import Job


async def enqueue(db: AsyncSession, tenant_id: int, receipt_id: int) -> None:
    db.add(Job(tenant_id=tenant_id, receipt_id=receipt_id))


async def run_once(factory: async_sessionmaker[AsyncSession]) -> bool:
    from janus_api.sources.service import process_event, record_failure

    async with factory() as db, db.begin():
        claim = (await db.execute(text("SELECT * FROM public.claim_ingest_job()"))).first()
        if claim is None:
            return False
        await set_context(db, tenant_id=claim.tenant_id)
        job = await db.get(Job, claim.id)
        if job is None:
            raise RuntimeError("Claimed job is missing")
        job.attempts += 1
        # Keep the job row locked until all CRM writes and status updates commit together.
        try:
            async with db.begin_nested():
                await process_event(db, job.receipt_id)
                await db.flush()
        except Exception as error:
            terminal = isinstance(error, ProcessingError) or job.attempts >= 5
            code = error.code if isinstance(error, ProcessingError) else "processing_failed"
            job.status = "failed" if terminal else "pending"
            job.error_code = code
            job.available_at = now() + timedelta(seconds=min(300, 5 * 2 ** (job.attempts - 1)))
            job.finished_at = now() if terminal else None
            await record_failure(db, job.receipt_id, code, terminal)
            logging.getLogger("janus").warning(
                json.dumps(
                    {
                        "event": "ingestion_failed",
                        "job_id": job.id,
                        "tenant_id": job.tenant_id,
                        "attempt": job.attempts,
                        "terminal": terminal,
                        "exception_type": type(error).__name__,
                    }
                )
            )
        else:
            job.status, job.finished_at, job.error_code = "done", now(), None
        return True
