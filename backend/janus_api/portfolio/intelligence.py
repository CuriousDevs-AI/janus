"""Janus Intelligence across the Portfolio with a language model.

The model never sees a table and never works out a number. Janus reads the Portfolio exactly as the
page does, under the person's own permissions (so money stays out for a role without it), turns it
into numbered facts, adds the owner's approved knowledge and the document passages that match the
question, and asks the model to answer only from those, citing each one it uses. Janus rules (the
page's own answers, no model) stay the default and cost nothing.

The model is one a company already set up, with that company's key; the person picks it and must be
allowed to manage AI there. Each company's monthly spend on these questions is capped, and so is the
number of questions a person asks a day. Every question, the model that answered, the facts it
cited and the cost are kept for the person (their memory for follow-ups) and in the audit trail.
"""

import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.ai import service as ai
from janus_api.audit.models import AuditLog
from janus_api.audit.service import record
from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.tenancy import set_context
from janus_api.org import overview as org
from janus_api.org import service as org_service
from janus_api.portfolio import ai_keys, knowledge, schemas
from janus_api.portfolio import summary as portfolio
from janus_api.portfolio.access import enter_company, readable_companies
from janus_api.portfolio.models import PortfolioQuestion
from janus_api.portfolio.periods import inr

FEATURE = "portfolio_question"
RULES = "rules"
LOCAL = ("://localhost", "://127.0.0.1", "://host.docker.internal")
MEMORY = 6

SYSTEM = """You are Janus Intelligence. You answer an owner's question about their companies.

Use ONLY the numbered facts and passages below. Each line starts with its id in brackets.
- Put the id of every fact or passage you use right after it, like [F3] or [D1].
- Never work out, estimate or invent a figure that is not in the facts, except simple sums and
  differences of figures that are, and say when you do.
- Never forecast or predict. If asked, say Janus does not forecast and give what exists today.
- If the facts do not answer the question, say "Janus does not have that in its records" and name
  what would answer it. Do not guess.
- Write plainly for a business owner in India: short sentences, rupees as written in the facts.
- At most 150 words, unless a list of companies needs more.
- If the owner states a lasting fact about one company that is not already in the facts (when a
  customer pays, who files GST), end with one line: REMEMBER <company name>: <the fact>.

Period: {period}.

Facts and passages:
{facts}"""


def _month_start() -> datetime:
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _local(base_url: str | None) -> bool:
    return bool(base_url) and any(host in (base_url or "") for host in LOCAL)


def _whose(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


async def _ai_role(db: AsyncSession, user_id: int, tenant_id: int) -> bool:
    _, role = await org_service.membership(db, user_id, tenant_id)
    return role.name == "owner" or "ai:manage" in role.permissions


async def models(db: AsyncSession, user_id: int, current_tenant: int | None) -> schemas.ModelsOut:
    """Janus rules first, then each model a company has set up that this person may use, with what
    it has cost this month against the cap; and the companies where they can set one up."""
    cap = get_settings().portfolio_ai_monthly_usd
    options = [
        schemas.ModelOption(
            id=RULES,
            label="Janus rules (no AI)",
            free=True,
            note="Fixed answers from the figures on the page. Free, and works with no model.",
        )
    ]
    companies: list[schemas.AiCompany] = []
    portfolio_keys = await ai_keys.keys(db, user_id, current_tenant)
    # A company's copy of a Portfolio key is the same key: it is offered once, as the Portfolio's.
    copies = {(item.id, held.provider) for held in portfolio_keys for item in held.copiedTo}
    try:
        for tenant_id in await readable_companies(db, user_id):
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            if not await _ai_role(db, user_id, tenant_id):
                continue
            company = await org.company(db, tenant_id)
            name = company.name if company else ""
            keys = await ai.list_credentials(db)
            spent = await ai.spent_since(db, FEATURE, _month_start())
            companies.append(
                schemas.AiCompany(
                    id=str(tenant_id),
                    name=name,
                    keys=[
                        schemas.AiKey(
                            provider=key.provider,
                            model=key.model,
                            keyLastFour=key.keyLastFour,
                            baseUrl=key.baseUrl,
                            enabled=key.enabled,
                        )
                        for key in keys
                    ],
                    spentUsd=str(spent),
                    capUsd=str(cap),
                )
            )
            for key in keys:
                if not key.enabled or (str(tenant_id), key.provider) in copies:
                    continue
                local = _local(key.baseUrl)
                # A free provider's model, or a ":free" OpenRouter one; Gemini's free tier too.
                free_tier = (
                    local
                    or key.model.endswith(":free")
                    or any(
                        item.base_url == key.baseUrl
                        or (item.base_url is None and item.provider == key.provider)
                        for item in ai.free_providers()
                    )
                )
                options.append(
                    schemas.ModelOption(
                        id=f"{tenant_id}:{key.provider}",
                        label=key.model,
                        provider=key.provider,
                        company=name,
                        free=free_tier,
                        note=(
                            f"Runs on your own server, set up in {name}."
                            if local
                            else f"Free tier, with the provider's limits, on {_whose(name)} key."
                            if free_tier
                            else f"Paid with {_whose(name)} key: ${spent:.2f} of ${cap:.2f}"
                            " this month."
                        ),
                    )
                )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
    here = await org.company(db, current_tenant) if current_tenant else None
    for held in portfolio_keys:
        free_tier = held.model.endswith(":free") or any(
            item.provider == held.provider for item in ai.free_providers()
        )
        options.insert(
            1,
            schemas.ModelOption(
                id=f"portfolio:{held.provider}",
                label=held.model,
                provider=held.provider,
                company="Portfolio key",
                free=free_tier,
                note=(
                    "Your Portfolio key"
                    + (", on the provider's free tier." if free_tier else ".")
                    + (
                        f" Its use is recorded in {here.name}, the company open now."
                        if here
                        else ""
                    )
                ),
            ),
        )
    free = [
        schemas.FreeProvider(
            id=item.id,
            name=item.name,
            provider=item.provider,
            baseUrl=item.base_url,
            models=list(item.models),
            limits=item.limits,
            keyUrl=item.key_url,
            modelsUrl=item.models_url,
        )
        for item in ai.free_providers()
    ]
    return schemas.ModelsOut(
        options=options,
        companies=companies,
        free=free,
        portfolioKeys=portfolio_keys,
        canAddKeys=bool(await org.owned_tenants(db, user_id)),
    )


def facts_for(view: schemas.PortfolioSummary) -> list[schemas.Source]:
    """The Portfolio as numbered facts, one figure or finding a line, each naming its company."""
    out: list[schemas.Source] = []

    def add(company: str, text: str) -> None:
        out.append(schemas.Source(id=f"F{len(out) + 1}", kind="figure", company=company, text=text))

    for c in view.companies:
        n = c.name
        add(n, f"{n} is in {c.industry or 'an unstated industry'}; {c.members} members in Janus.")
        if c.health:
            reasons = "; ".join(c.health.reasons) or "nothing needs attention"
            word = {"red": "needs you", "amber": "watch", "green": "on track"}[c.health.status]
            add(n, f"{n} health: {word} ({reasons}).")
        if c.books:
            now, before = c.books.current, c.books.previous
            add(
                n,
                f"{n} sales this period, before GST: {inr(now.netSales)}"
                f" (the same days before: {inr(before.netSales)}).",
            )
            add(
                n,
                f"{n} supplier costs this period: {inr(now.costs)}; profit before salaries"
                f" {inr(now.profitBeforePayroll)} (before: {inr(before.profitBeforePayroll)}).",
            )
            add(
                n,
                f"{n} money in from customers {inr(now.moneyIn)}, out to suppliers"
                f" {inr(now.moneyOut)} this period.",
            )
        if c.gst:
            last = c.gst.lastMonth
            payable = Decimal(last.payable)
            left = (
                f"{inr(payable)} to pay"
                if payable >= 0
                else f"{inr(-payable)} credit carried to next month"
            )
            add(
                n,
                f"{n} GST for {last.label} from the books: {inr(last.output)} charged, "
                f"{inr(last.creditNotes)} back on credit notes, {inr(last.input)} input credit, "
                f"{inr(last.carriedIn)} credit carried in, {inr(last.blocked)} blocked credit "
                f"not taken; {left} (an estimate).",
            )
        if c.cash and c.cash.total is not None:
            months = c.cash.runwayMonths
            how_long = "more than 3 years" if months and months > 36 else f"about {months} months"
            lasts = (
                f", lasting {how_long} at {inr(c.cash.monthlyBurn)} a month"
                if months is not None
                else ""
            )
            add(n, f"{n} cash in the bank {inr(c.cash.total)} as of {c.cash.asOf}{lasts}.")
        if c.tds:
            t = c.tds
            deposited = inr(t.deposited) if t.deposited is not None else "no challan recorded"
            add(
                n,
                f"{n} TDS for {t.label}: {inr(t.deducted)} deducted ({inr(t.onBills)} on bills,"
                f" {inr(t.onSalaries)} on salaries), {deposited} deposited,"
                f" {inr(t.toDeposit)} still to deposit by {t.dueOn}.",
            )
        if c.unfiledCount:
            add(
                n,
                f"{n} has {c.unfiledCount} filings past due and not recorded as filed since"
                f" {c.unfiledSince}.",
            )
        if c.people:
            pay = c.people.monthlyPayroll
            add(
                n,
                f"{n} has {c.people.headcount} people, {c.people.onLeaveToday} on leave today"
                + (f"; salaries in HR {inr(pay)} a month" if pay is not None else "")
                + ".",
            )
        if c.money:
            m = c.money
            add(
                n,
                f"{n} customers owe {inr(m.receivable)}, of which {inr(m.overdue)} is past due"
                f" in {m.overdueInvoices} invoices.",
            )
            add(
                n,
                f"{n} owes suppliers {inr(m.payable)}; {inr(m.payableLate)} already late,"
                f" {inr(m.payableDueThisWeek)} due within 7 days including the late ones.",
            )
        cur, prev = c.period.current, c.period.previous
        add(
            n,
            f"{n} leads this period: {cur.leads} (before: {prev.leads}); deals won {cur.wonDeals}"
            f" (before: {prev.wonDeals}).",
        )
        add(
            n,
            f"{n} open deals: {c.crm.openDeals} worth {inr(c.crm.pipelineValue)}; won all time"
            f" {c.crm.wonDeals} worth {inr(c.crm.wonValue)}.",
        )
        for customer in c.customers[:3]:
            add(
                n,
                f"{n} customer {customer.name}: sales {inr(customer.current)} this period"
                f" (before: {inr(customer.previous)}).",
            )
        for source in c.leadSources[:3]:
            add(
                n,
                f"{n} leads from {source.source.replace('_', ' ')}: {source.current}"
                f" (before: {source.previous}).",
            )
        for item in c.attention[:5]:
            add(n, f"{n} needs attention ({item.severity}): {item.text}.")
        for due in c.compliance:
            if due.status in ("overdue", "due_soon"):
                state = "past due, not recorded as filed" if due.status == "overdue" else "due soon"
                add(n, f"{n} filing {due.label} for {due.period}, due {due.dueOn}: {state}.")
        if not c.complianceSetUp:
            add(n, f"{n} has no filings set up in Janus, so filings are not tracked.")
        for approval in c.approvals:
            add(n, f"{n} waiting for a decision: {approval.count} {approval.label.lower()}.")
        if c.stock:
            add(
                n,
                f"{n} stock: {c.stock.belowReorder} items at or under reorder,"
                f" {c.stock.expiringBatches} batches expiring in 30 days.",
            )
        if c.delivery:
            add(
                n,
                f"{n} projects: {c.delivery.activeProjects} active, {c.delivery.lateProjects}"
                f" late, {c.delivery.overdueMilestones} milestones past due.",
            )
        if c.money is None:
            add(n, f"Money for {n} is not shared with this person's role.")
    return out


def cited(answer: str, sources: list[schemas.Source]) -> list[schemas.Source]:
    ids = list(dict.fromkeys(re.findall(r"\[([FKD]\d+)\]", answer)))
    by_id = {source.id: source for source in sources}
    return [by_id[i] for i in ids if i in by_id]


async def ask(
    db: AsyncSession,
    user_id: int,
    current_tenant: int | None,
    ip: str | None,
    data: schemas.AskIn,
) -> schemas.AskOut:
    if data.model == RULES or ":" not in data.model:
        raise ApiError("rules_in_page", "Janus rules answer on the page; pick a model to ask.", 422)
    company_id, provider = data.model.split(":", 1)
    if provider not in ai.providers():
        raise ApiError("not_found", "That model is not set up.", 404)
    settings = get_settings()
    try:
        # The person's own questions today, under their own context.
        await set_context(db, user_id=user_id, tenant_id=current_tenant)
        # Counted from the audit trail, which clearing the history does not touch.
        asked_today = await db.scalar(
            select(func.count(AuditLog.id)).where(
                AuditLog.user_id == user_id,
                AuditLog.tenant_id.is_(None),
                AuditLog.action == "portfolio.question_asked",
                AuditLog.created_at >= datetime.now(UTC) - timedelta(days=1),
            )
        )
        if (asked_today or 0) >= settings.portfolio_ai_daily_questions:
            raise ApiError(
                "question_limit",
                f"You have asked {asked_today} questions in the last day, the most allowed.",
                429,
            )
        history = list(
            await db.scalars(
                select(PortfolioQuestion)
                .where(PortfolioQuestion.user_id == user_id)
                .order_by(PortfolioQuestion.id.desc())
                .limit(MEMORY)
            )
        )[::-1]

        view = await portfolio.summary(db, user_id, current_tenant, ip, data.period)
        sources = facts_for(view)
        names: dict[str, int] = {}
        for company in view.companies:
            tenant_id = int(company.id)
            names[company.name.lower()] = tenant_id
            await set_context(db, user_id=user_id, tenant_id=tenant_id)
            facts, found = await knowledge.relevant(db, tenant_id, data.question)
            for fact in facts:
                sources.append(
                    schemas.Source(
                        id=f"K{sum(s.kind == 'knowledge' for s in sources) + 1}",
                        kind="knowledge",
                        company=company.name,
                        text=f"{company.name}: {fact.body}",
                    )
                )
            for passage in found:
                sources.append(
                    schemas.Source(
                        id=f"D{sum(s.kind == 'document' for s in sources) + 1}",
                        kind="document",
                        company=company.name,
                        title=passage.title,
                        text=f'{company.name}, from "{passage.title}": {passage.body}',
                    )
                )

        key_row = None
        if company_id == "portfolio":
            # The Portfolio's own key: its use is recorded in, and capped by, the company open now.
            await set_context(db, user_id=user_id, tenant_id=current_tenant)
            key_row = await ai_keys.portfolio_key(db, user_id, provider)
            if key_row is None or current_tenant is None:
                raise ApiError("not_found", "That model is not set up.", 404)
            tenant_id = current_tenant
        else:
            tenant_id = await enter_company(db, user_id, company_id, "ai:manage")
        spent = await ai.spent_since(db, FEATURE, _month_start())
        if spent >= settings.portfolio_ai_monthly_usd:
            raise ApiError(
                "ai_budget_reached",
                f"This company's key has spent ${spent:.2f} on Portfolio questions this month,"
                f" the most allowed (${settings.portfolio_ai_monthly_usd:.2f}). Use Janus rules,"
                " or another model.",
                429,
            )
        p = view.period
        period = (
            f"{p.label}: {p.start} to {p.end}, compared with the same days before"
            f" ({p.previousStart} to {p.previousEnd})"
        )
        system = SYSTEM.format(
            period=period,
            facts="\n".join(f"[{s.id}] {s.text}" for s in sources) or "(none)",
        )
        turns = [t for q in history for t in (("user", q.question), ("assistant", q.answer))]
        result = (
            await ai.converse_with_key(
                tenant_id,
                provider,
                key_row.model,
                ai_keys.secret(key_row),
                system[:60000],
                [*turns, ("user", data.question)],
                feature=FEATURE,
            )
            if key_row is not None
            else await ai.converse(
                db,
                provider,  # type: ignore[arg-type]
                system[:60000],
                [*turns, ("user", data.question)],
                feature=FEATURE,
            )
        )

        text = result.text.strip()
        suggestions: list[str] = []
        for match in re.finditer(r"^REMEMBER\s+([^:\n]{2,160}):\s*(.+)$", text, re.MULTILINE):
            target = names.get(match.group(1).strip().lower())
            if target is not None:
                suggestions.append(f"{match.group(1).strip()}: {match.group(2).strip()}")
                await set_context(db, user_id=user_id, tenant_id=target)
                await knowledge.suggest(db, target, match.group(2).strip())
        text = re.sub(r"^REMEMBER\s+[^\n]*$", "", text, flags=re.MULTILINE).strip()
        used = cited(text, sources)
        model_label = f"{result.usage.model} ({result.usage.provider})"

        await set_context(db, user_id=user_id, tenant_id=current_tenant)
        row = PortfolioQuestion(
            user_id=user_id,
            key_tenant_id=tenant_id,
            model=model_label[:200],
            question=data.question,
            answer=text[:8000],
            sources=[source.model_dump() for source in used],
            cost_usd=result.usage.costUsd,
        )
        db.add(row)
        await db.flush()
        # The person's own record (no company), so they and the daily limit can read it; the
        # company whose key paid is in the details and in that company's AI usage.
        record(
            db,
            "portfolio.question_asked",
            user_id=user_id,
            ip=ip,
            details={
                "question_id": row.id,
                "key_company": tenant_id,
                "provider": provider,
                "sources": len(used),
            },
        )
        return schemas.AskOut(
            id=str(row.id),
            question=data.question,
            answer=text,
            model=model_label,
            sources=used,
            grounded=bool(used),
            costUsd=str(result.usage.costUsd) if result.usage.costUsd is not None else None,
            suggested=suggestions,
            createdAt=datetime.now(UTC).isoformat(),
        )
    finally:
        await set_context(db, user_id=user_id, tenant_id=current_tenant)


async def history(db: AsyncSession, user_id: int) -> list[schemas.AskOut]:
    rows = await db.scalars(
        select(PortfolioQuestion)
        .where(PortfolioQuestion.user_id == user_id)
        .order_by(PortfolioQuestion.id.desc())
        .limit(50)
    )
    return [
        schemas.AskOut(
            id=str(row.id),
            question=row.question,
            answer=row.answer,
            model=row.model,
            sources=[schemas.Source.model_validate(s) for s in row.sources],
            grounded=bool(row.sources),
            costUsd=str(row.cost_usd) if row.cost_usd is not None else None,
            suggested=[],
            createdAt=row.created_at.isoformat(),
        )
        for row in list(rows)[::-1]
    ]


async def forget(db: AsyncSession, user_id: int, ip: str | None) -> None:
    """Clears this person's questions: Janus no longer uses them for follow-ups."""
    await db.execute(delete(PortfolioQuestion).where(PortfolioQuestion.user_id == user_id))
    record(db, "portfolio.questions_cleared", user_id=user_id, ip=ip)
