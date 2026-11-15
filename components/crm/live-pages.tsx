"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { PORTFOLIO_ROLES } from "@/lib/access";
import { KnowledgeCard, usePortfolioApi, type PortfolioSummary } from "@/features/portfolio";

/** The company open now, as the Portfolio reads it for this person; undefined while it loads. */
function useCompany() {
  const session = useSession();
  const hasPortfolio = session.tenants.some((item) => PORTFOLIO_ROLES.includes(item.role) && item.status === "active");
  const summary = usePortfolioApi<PortfolioSummary>(hasPortfolio ? "/portfolio/summary?period=month" : null, { keepPrevious: true });
  return { company: summary.data?.companies.find((item) => item.current), loading: summary.loading, error: summary.error };
}

function Status({ loading, error, what }: { loading: boolean; error?: string; what: string }) {
  return loading ? <p className="text-sm text-muted-foreground">Reading your records…</p>
    : <p role="alert" className="text-sm text-danger">{error ? `${what} could not be read: ${error}` : `Your role does not include this company's ${what.toLowerCase()}.`}</p>;
}

/** What Janus may use beside the records: facts and documents the owner added, kept on the server. */
export function LiveKnowledge() {
  const { company, loading, error } = useCompany();
  return <div className="mx-auto flex max-w-[1000px] flex-col pb-10">
    <PageHeader title="Knowledge" description="Facts and documents Janus uses beside your records: your refund policy, price list, how a customer pays. Everyone who can see the company's figures can see them, and only the Owner adds them." />
    <div className="px-6">{company ? <KnowledgeCard list={[company]} bare /> : loading || error ? <Status loading={loading} error={error} what="Knowledge" /> : <p className="text-sm text-muted-foreground">Knowledge is managed in the Portfolio. Ask the Owner for access if you need it.</p>}</div>
  </div>;
}

/** Decisions waiting across the company: leave, claims, spend, credit notes, workflow runs and the rest. */
export function LiveApprovals() {
  const { company, loading, error } = useCompany();
  const waiting = company?.approvals.filter((item) => item.count > 0) ?? [];
  return <div className="mx-auto flex max-w-[1000px] flex-col pb-10">
    <PageHeader title="Approvals" description="Everything waiting for someone to decide, from every workspace. Open one to decide it where it was raised." />
    <div className="px-6">{loading || error ? <Status loading={loading} error={error} what="Approvals" />
      : !waiting.length ? <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">Nothing is waiting for a decision.</p>
      : <ul className="divide-y divide-border rounded-lg border border-border bg-surface">{waiting.map((item) => <li key={item.kind}><Link href={item.to} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-2"><span><span className="font-semibold tabular-nums">{item.count}</span> {(item.count === 1 ? item.one : item.label).toLowerCase()}</span><ArrowRight className="size-4 text-muted-foreground" aria-hidden /></Link></li>)}</ul>}
    </div>
  </div>;
}

type Announcement = { id: string; title: string | null; body: string; author: { name: string }; createdAt: string };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** What needs you, decisions waiting and the team's announcements, from the company's own records. */
export function LiveNotifications() {
  const { company, loading, error } = useCompany();
  const news = useApi<Announcement[]>("/team/announcements?after=0");
  const waiting = company?.approvals.filter((item) => item.count > 0) ?? [];
  return <div className="mx-auto flex max-w-[1000px] flex-col pb-10">
    <PageHeader title="Notifications" description="What needs you, what is waiting for a decision, and what the team announced. Choose what reaches you by email in My account." />
    <div className="flex flex-col gap-5 px-6">
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Needs you</h2>
        {loading || error ? <div className="mt-2"><Status loading={loading} error={error} what="Notifications" /></div>
          : !company?.attention.length ? <p className="mt-2 text-sm text-muted-foreground">Nothing needs you right now.</p>
          : <ul className="mt-2 divide-y divide-border">{company.attention.map((item, index) => <li key={index}><Link href={item.to} className="flex items-start justify-between gap-3 py-2 text-sm hover:text-accent"><span className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.severity === "high" ? "bg-danger" : item.severity === "medium" ? "bg-warning" : "bg-muted-foreground"}`} aria-hidden />{item.text}</span><ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /></Link></li>)}</ul>}
      </section>
      {waiting.length > 0 && <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Waiting for a decision</h2>
        <ul className="mt-2 divide-y divide-border">{waiting.map((item) => <li key={item.kind}><Link href={item.to} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent"><span>{item.count} {(item.count === 1 ? item.one : item.label).toLowerCase()}</span><ArrowRight className="size-4 text-muted-foreground" aria-hidden /></Link></li>)}</ul>
      </section>}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Megaphone className="size-4 text-accent" aria-hidden />Team announcements</h2>
        {news.loading ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          : news.error ? <p role="alert" className="mt-2 text-sm text-danger">{news.error}</p>
          : !(news.data ?? []).length ? <p className="mt-2 text-sm text-muted-foreground">No announcements yet. They are posted in Team Chat&apos;s announcements channel.</p>
          : <ul className="mt-2 divide-y divide-border">{news.data!.map((item) => <li key={item.id} className="py-2.5 text-sm"><p className="font-medium">{item.title || item.body.slice(0, 80)}</p>{item.title && <p className="mt-0.5 text-muted-foreground">{item.body}</p>}<p className="mt-1 text-xs text-muted-foreground">{item.author.name} · {when(item.createdAt)}</p></li>)}</ul>}
      </section>
    </div>
  </div>;
}
