"""What Janus knows about each company beyond its records, and finding the parts that answer a
question.

A fact is one line the owner approved ("Kavita Stores pays on the 20th"). A document is text the
owner added (a policy, a contract, a note from the CA), kept in passages of about 1,200 characters.
Janus may suggest a fact from a conversation; it waits for the owner and is never used until they
approve it. Finding passages uses Postgres full-text search, so it needs no model and costs nothing.
"""

import re
import secrets

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.audit.service import record
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org
from janus_api.portfolio import schemas
from janus_api.portfolio.access import enter_company, readable_companies
from janus_api.portfolio.models import PortfolioKnowledge

PASSAGE = 1200


def passages(text: str) -> list[str]:
    """Splits a document at paragraph, then sentence, boundaries into passages of about 1,200
    characters, so one passage answers one thing."""
    parts: list[str] = []
    current = ""
    for piece in re.split(r"(?<=[.!?])\s+|\n\s*\n", text.strip()):
        piece = piece.strip()
        while len(piece) > PASSAGE:
            parts.append(piece[:PASSAGE])
            piece = piece[PASSAGE:]
        if current and len(current) + len(piece) + 1 > PASSAGE:
            parts.append(current)
            current = ""
        current = f"{current} {piece}".strip()
    if current:
        parts.append(current)
    return parts


def item_out(row: PortfolioKnowledge, company: str) -> schemas.KnowledgeItem:
    return schemas.KnowledgeItem(
        id=str(row.id),
        companyId=str(row.tenant_id),
        company=company,
        kind=row.kind,
        status=row.status,
        title=row.title,
        body=row.body,
        document=row.document,
        passage=row.passage,
        createdAt=row.created_at.isoformat(),
    )


async def list_knowledge(
    db: AsyncSession, user_id: int, current_tenant: int | None
) -> list[schemas.KnowledgeItem]:
    """Every company's facts, suggestions and documents this person may see, newest first."""
    out: list[schemas.KnowledgeItem] = []
    try:
        for tenant_id in await readable_companies(db, user_id):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            company = await org.company(db, tenant_id)
            rows = await db.scalars(
                select(PortfolioKnowledge)
                .where(PortfolioKnowledge.tenant_id == tenant_id)
                .order_by(PortfolioKnowledge.id.desc())
                .limit(500)
            )
            out += [item_out(row, company.name if company else "") for row in rows]
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    return out


async def add(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    data: schemas.KnowledgeAdd,
    ip: str | None,
) -> list[schemas.KnowledgeItem]:
    """The company's Owner adds a fact, or a document that is kept in passages."""
    try:
        tenant_id = await enter_company(db, user_id, data.companyId, "owner")
        company = await org.company(db, tenant_id)
        if data.kind == "fact":
            texts, document = [data.body], None
        else:
            texts, document = passages(data.body), secrets.token_hex(8)
        rows = [
            PortfolioKnowledge(
                tenant_id=tenant_id,
                kind=data.kind,
                status="approved",
                title=data.title,
                body=text,
                document=document,
                passage=index,
                created_by=user_id,
            )
            for index, text in enumerate(texts)
        ]
        db.add_all(rows)
        await db.flush()
        record(
            db,
            "portfolio.knowledge_added",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"kind": data.kind, "passages": len(rows)},
        )
        return [item_out(row, company.name if company else "") for row in rows]
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def suggest(db: AsyncSession, tenant_id: int, text: str) -> None:
    """Janus suggests a fact from a conversation; the caller is already in the company's context.
    It is used only after the owner approves it."""
    db.add(
        PortfolioKnowledge(
            tenant_id=tenant_id,
            kind="fact",
            status="suggested",
            title="Suggested by Janus",
            body=text[:1000],
        )
    )


async def decide(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    company_id: str,
    item_id: str,
    approve: bool,
    ip: str | None,
) -> None:
    """The Owner approves a suggested fact, or removes any fact or a whole document."""
    if not item_id.isdigit():
        raise ApiError("not_found", "Not found.", 404)
    try:
        tenant_id = await enter_company(db, user_id, company_id, "owner")
        row = await db.get(PortfolioKnowledge, int(item_id))
        if row is None or row.tenant_id != tenant_id:
            raise ApiError("not_found", "Not found.", 404)
        if approve:
            row.status = "approved"
        elif row.document:
            await db.execute(
                delete(PortfolioKnowledge).where(PortfolioKnowledge.document == row.document)
            )
        else:
            await db.delete(row)
        record(
            db,
            "portfolio.knowledge_approved" if approve else "portfolio.knowledge_removed",
            user_id=user_id,
            tenant_id=tenant_id,
            ip=ip,
            details={"id": int(item_id)},
        )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def relevant(
    db: AsyncSession, tenant_id: int, question: str, limit: int = 4
) -> tuple[list[PortfolioKnowledge], list[PortfolioKnowledge]]:
    """For a question, under the company's own context: its approved facts (all of them, up to
    30), and the document passages that best match the question's words."""
    facts = list(
        await db.scalars(
            select(PortfolioKnowledge)
            .where(
                PortfolioKnowledge.tenant_id == tenant_id,
                PortfolioKnowledge.kind == "fact",
                PortfolioKnowledge.status == "approved",
            )
            .order_by(PortfolioKnowledge.id.desc())
            .limit(30)
        )
    )
    words = " OR ".join(re.findall(r"[A-Za-z0-9]{3,}", question)[:20])
    if not words:
        return facts, []
    document = func.to_tsvector("simple", PortfolioKnowledge.title + " " + PortfolioKnowledge.body)
    query = func.websearch_to_tsquery("simple", words)
    found = list(
        await db.scalars(
            select(PortfolioKnowledge)
            .where(
                PortfolioKnowledge.tenant_id == tenant_id,
                PortfolioKnowledge.kind == "document",
                document.op("@@")(query),
            )
            .order_by(func.ts_rank(document, query).desc())
            .limit(limit)
        )
    )
    return facts, found
