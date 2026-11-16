"""File attachments for leads, deals and contacts."""

import os
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.crm import schemas
from janus_api.crm.models import CrmAttachment

UPLOAD_DIR = os.environ.get("JANUS_UPLOAD_DIR", "/tmp/janus-uploads")


def _out(a: CrmAttachment) -> schemas.AttachmentOut:
    return schemas.AttachmentOut(
        id=str(a.id),
        entityType=a.entity_type,
        entityId=str(a.entity_id),
        filename=a.filename,
        contentType=a.content_type,
        sizeBytes=a.size_bytes,
        uploadedBy=str(a.uploaded_by),
        createdAt=a.created_at,
    )


async def list_attachments(
    db: AsyncSession,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
) -> list[schemas.AttachmentOut]:
    rows = (
        (
            await db.execute(
                select(CrmAttachment)
                .where(
                    CrmAttachment.tenant_id == tenant_id,
                    CrmAttachment.entity_type == entity_type,
                    CrmAttachment.entity_id == entity_id,
                )
                .order_by(CrmAttachment.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_out(a) for a in rows]


async def create_attachment(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    entity_type: str,
    entity_id: int,
    filename: str,
    content_type: str,
    content: bytes,
) -> schemas.AttachmentOut:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    storage_key = f"{tenant_id}/{entity_type}/{entity_id}/{uuid.uuid4().hex}/{filename}"
    full_path = os.path.join(UPLOAD_DIR, storage_key)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as f:
        f.write(content)

    a = CrmAttachment(
        tenant_id=tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        filename=filename,
        content_type=content_type,
        size_bytes=len(content),
        storage_key=storage_key,
        uploaded_by=user_id,
    )
    db.add(a)
    await db.flush()
    record(
        db,
        "crm.attachment.uploaded",
        user_id=user_id,
        tenant_id=tenant_id,
        details={
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "filename": filename,
        },
    )
    return _out(a)


async def get_attachment(
    db: AsyncSession,
    tenant_id: int,
    attachment_id: int,
) -> CrmAttachment:
    a = await db.scalar(
        select(CrmAttachment).where(
            CrmAttachment.tenant_id == tenant_id,
            CrmAttachment.id == attachment_id,
        )
    )
    if not a:
        raise ApiError("attachment_not_found", "Attachment not found", 404)
    return a


async def delete_attachment(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    attachment_id: int,
) -> None:
    a = await get_attachment(db, tenant_id, attachment_id)
    full_path = os.path.join(UPLOAD_DIR, a.storage_key)
    if os.path.exists(full_path):
        os.remove(full_path)
    await db.delete(a)
    await db.flush()
    record(
        db,
        "crm.attachment.deleted",
        user_id=user_id,
        tenant_id=tenant_id,
        details={"attachment_id": str(attachment_id), "filename": a.filename},
    )
