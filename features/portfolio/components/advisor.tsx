"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleCheck, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { useRoles } from "@/features/portfolio/lib/companies";
import { day, todayIst } from "@/features/portfolio/lib/format";
import { areaNames, areas, findings, measured, planTitle, readPlan, type Finding } from "@/features/portfolio/lib/advisor";
import type { PortfolioCompany, PortfolioKnowledgeItem } from "@/features/portfolio/types";

type Run = { id: string; workflowId: string; status: string; createdAt: string; result: Record<string, unknown> };
const dot = { red: "bg-danger", amber: "bg-warning", green: "bg-success" } as const;
const tone = { high: "text-danger", medium: "text-warning", low: "text-muted-foreground" } as const;
const word = { high: "Needs you now", medium: "Needs you soon", low: "Worth a look" } as const;
const addDays = (iso: string, days: number) => { const date = new Date(`${iso}T12:00:00+05:30`); date.setDate(date.getDate() + days); return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); };
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T12:00:00+05:30`).getTime() - new Date(`${todayIst()}T12:00:00+05:30`).getTime()) / 86_400_000);

/**
 * Janus as the owner's business advisor: how each area stands, what it sees and why it matters,
 * what went wrong this week, and a 30-day plan. A plan item the owner commits to is kept in what
 * Janus knows, and checked against the figures every time this page opens.
 */
export function Advisor({ company }: { company: PortfolioCompany }) {
  const list = React.useMemo(() => findings(company), [company]);
  const status = areas(list);
  const knowledge = usePortfolioApi<PortfolioKnowledgeItem[]>("/portfolio/knowledge");
  const runs = useApi<Run[]>("/business/automations/executions");
  const owner = useRoles().owns(company);
  const [saving, setSaving] = React.useState<string | null>(null);

  const commitments = (knowledge.data ?? []).filter((item) => item.companyId === company.id && item.status === "approved").flatMap((item) => { const plan = readPlan(item.title); return plan ? [{ ...plan, item }] : []; });
  const committed = new Set(commitments.map((entry) => entry.id));
  const plan = list.filter((item) => !committed.has(item.id)).slice(0, 5);
  const weekAgo = addDays(todayIst(), -7);
  const failed = (runs.data ?? []).filter((run) => run.status === "failed" && run.createdAt.slice(0, 10) >= weekAgo);
  const incidents = [
    ...company.compliance.filter((item) => item.status === "overdue").map((item) => ({ key: item.key, text: `${item.label} for ${item.period} was due ${day(item.dueOn)} and is not recorded as filed.`, href: `/portfolio?view=compliance&company=${company.id}` })),
    ...(company.support?.urgent ? [{ key: "urgent", text: `${company.support.urgent} urgent support ticket${company.support.urgent === 1 ? " is" : "s are"} open.`, href: "/tickets?workspace=customer-support" }] : []),
    ...failed.map((run) => ({ key: run.id, text: `A workflow run failed on ${day(run.createdAt.slice(0, 10))}${typeof run.result.error === "string" ? `: ${run.result.error}` : "."}`, href: `/automations/${run.workflowId}?workspace=business&tab=runs` })),
  ];

  async function commit(finding: Finding) {
    setSaving(finding.id);
    const due = addDays(todayIst(), 30);
    try {
      await api("/portfolio/knowledge", { method: "POST", body: JSON.stringify({ companyId: company.id, kind: "fact", title: planTitle(finding, due), body: `Plan to ${day(due)}: ${finding.plan} On ${day(todayIst())} ${finding.measure.label} was ${measured(finding, finding.measure.now)}; the target is ${measured(finding, finding.measure.target)}.` }) });
      knowledge.reload();
      toast.success("Added to your plan. Janus checks it against your figures each time you open Advisor.");
    } catch (error) { toast.error(message(error)); } finally { setSaving(null); }
  }
  async function drop(item: PortfolioKnowledgeItem) {
    try { await api(`/portfolio/companies/${item.companyId}/knowledge/${item.id}`, { method: "DELETE" }); knowledge.reload(); } catch (error) { toast.error(message(error)); }
  }

  return <div className="flex flex-col gap-5">
    <section aria-label="How each area stands" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {status.map((item) => <div key={item.area} className="rounded-lg border border-border bg-surface p-3">
        <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${dot[item.status]}`} aria-hidden /><span className="text-sm font-semibold">{areaNames[item.area]}</span></div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.reason}</p>
      </div>)}
    </section>

    <SectionCard title="Your plan" description={commitments.length ? "What you committed to, checked against today's figures." : "Commit to a step below and Janus keeps it, and checks it against your figures each time you come back."}>
      {commitments.length === 0 ? <p className="text-sm text-muted-foreground">No plan yet.</p>
        : <ul className="divide-y divide-border">{commitments.map(({ id, due, item }) => {
          const open = list.find((finding) => finding.id === id);
          const left = daysUntil(due);
          return <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="flex min-w-0 items-start gap-2.5">
              {open ? <Target className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />}
              <div className="min-w-0">
                <p className="text-sm font-medium">{open ? open.plan : item.body.replace(/^Plan to [^:]+: /, "").split(" On ")[0]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{open ? `Now ${measured(open, open.measure.now)} ${open.measure.label}, target ${measured(open, open.measure.target)}. ${left >= 0 ? `${left} day${left === 1 ? "" : "s"} left` : `${-left} day${left === -1 ? "" : "s"} past the date`}.` : "Done: Janus no longer sees this in your figures."}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {open && <Button size="sm" variant="secondary" asChild><Link href={open.href}>Work on it</Link></Button>}
              {owner && <Button size="sm" variant="ghost" onClick={() => void drop(item)}>{open ? "Drop" : "Clear"}</Button>}
            </div>
          </li>;
        })}</ul>}
    </SectionCard>

    <SectionCard title="What Janus sees" description="From your own records, most serious first: what it is, why it matters, and what to do this week.">
      {list.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CircleCheck className="size-4 text-success" aria-hidden />Nothing in your figures needs you right now. Keep your records current and Janus will say when something does.</p>
        : <ul className="flex flex-col gap-3">{list.map((finding) => <li key={finding.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone[finding.severity]}`}>{word[finding.severity]} · {areaNames[finding.area]}</p>
              <p className="mt-1 text-sm font-semibold">{finding.title}</p>
            </div>
            {owner && plan.some((item) => item.id === finding.id) && <Button size="sm" variant="secondary" disabled={saving === finding.id} onClick={() => void commit(finding)}><Target className="size-3.5" />Add to my plan</Button>}
            {committed.has(finding.id) && <span className="text-xs font-medium text-accent">In your plan</span>}
          </div>
          <p className="mt-2 text-sm">{finding.sees}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Why it matters: </span>{finding.matters}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
            <p className="text-xs"><span className="font-medium">This week: </span>{finding.action}</p>
            <Link href={finding.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline">Do it<ArrowRight className="size-3" aria-hidden /></Link>
          </div>
        </li>)}</ul>}
    </SectionCard>

    <SectionCard title="Incidents this week" description="What went wrong: filings missed, urgent customers waiting, and workflows that failed.">
      {incidents.length === 0 ? <p className="text-sm text-muted-foreground">Nothing went wrong this week.</p>
        : <ul className="divide-y divide-border">{incidents.map((item) => <li key={item.key}><Link href={item.href} className="-mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-surface-2"><span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{item.text}</span><ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /></Link></li>)}</ul>}
    </SectionCard>
  </div>;
}
