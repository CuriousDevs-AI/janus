"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { businessHome } from "@/lib/company";
import { switchTenant } from "@/lib/live-company";
import type { PortfolioCompany, PortfolioSummary } from "@/lib/api/types";

const titles: Record<string, [string, string]> = {
  overview: ["Overview", "Every company you own, at a glance."],
  analytics: ["Analytics", "The same measures for every company, side by side."],
  finance: ["Finance", "Money in and out, by company."],
  companies: ["Companies", "Add a company or open one."],
  intelligence: ["Janus Intelligence", "Ask a question across all your companies."],
  notifications: ["Notifications", "What needs you, from every company."],
  people: ["Portfolio access", "Who else can see the Portfolio."],
};
const palette = ["#2563eb", "#d97706", "#16a34a", "#9333ea", "#dc2626"];

/** Rupees the way an Indian owner reads them: ₹12,500 below a lakh, then ₹4.2L and ₹1.3Cr. */
export function inr(value: number) {
  if (Math.abs(value) >= 1e7) return `₹${(value / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (Math.abs(value) >= 1e5) return `₹${(value / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}
const winRate = (item: PortfolioCompany) => { const closed = item.crm.wonDeals + item.crm.lostDeals; return closed ? Math.round((item.crm.wonDeals / closed) * 100) : null; };
const open = (item: PortfolioCompany, to = businessHome) => item.current ? window.location.assign(to) : switchTenant(item.id, to).catch((error) => toast.error(message(error)));

/** The Portfolio for a real account: every company the person owns, as the server reports it. */
export function LivePortfolio() {
  const params = useSearchParams();
  const view = params.get("view") ?? "overview";
  const [adding, setAdding] = React.useState(params.get("add") === "1");
  const summary = useApi<PortfolioSummary>("/portfolio/summary");
  const [title, description] = titles[view] ?? titles.overview;
  const list = summary.data?.companies ?? [];
  return <div className="mx-auto flex max-w-[1240px] flex-col">
    <PageHeader title={title} description={description} actions={list.length > 0 && <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-4" />Add company</Button>} />
    <div className="flex flex-col gap-6 px-6 pb-10">
      {summary.loading ? <p className="text-sm text-muted-foreground" role="status">Loading your companies…</p>
        : summary.error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">{summary.error}<Button size="sm" variant="secondary" onClick={summary.reload}>Try again</Button></div>
        : list.length === 0 ? <p className="text-sm text-muted-foreground" role="status">The Portfolio shows the companies you own. You are not the Owner of any company yet.</p>
        : view === "analytics" ? <Analytics list={list} />
        : view === "companies" ? <Companies list={list} onAdd={() => setAdding(true)} />
        : view === "overview" ? <Overview list={list} />
        : <SectionCard title={title} description="Not on real accounts yet."><p className="text-sm text-muted-foreground">This view works in the preview only for now. Overview, Analytics and Companies show your real companies.</p></SectionCard>}
    </div>
    {adding && <AddCompany onClose={() => setAdding(false)} />}
  </div>;
}

const Kpi = ({ label, value, detail }: { label: string; value: string; detail: string }) => <div className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;

function Overview({ list }: { list: PortfolioCompany[] }) {
  const sum = (pick: (item: PortfolioCompany) => number) => list.reduce((total, item) => total + pick(item), 0);
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Kpi label="Companies" value={String(list.length)} detail="You are the Owner" />
      <Kpi label="Members" value={String(sum((item) => item.members))} detail="Active logins, all companies" />
      <Kpi label="Open pipeline" value={inr(sum((item) => Number(item.crm.pipelineValue)))} detail={`${sum((item) => item.crm.openDeals)} open deals`} />
      <Kpi label="Won so far" value={inr(sum((item) => Number(item.crm.wonValue)))} detail={`${sum((item) => item.crm.wonDeals)} deals won`} />
      <Kpi label="Open tickets" value={String(sum((item) => item.openTickets))} detail="Support, all companies" />
    </div>
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {list.map((item) => { const rate = winRate(item); return <section key={item.id} aria-label={item.name} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{item.name}</h3><p className="truncate text-xs text-muted-foreground">{item.industry || "Industry not set"} · since {item.createdAt}</p></div>{item.current && <Badge variant="neutral">Open now</Badge>}</div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-[11px] text-muted-foreground">Leads</dt><dd className="font-semibold tabular-nums">{item.crm.leads}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Open pipeline</dt><dd className="font-semibold tabular-nums">{inr(Number(item.crm.pipelineValue))}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Win rate</dt><dd className="font-semibold tabular-nums">{rate === null ? "—" : `${rate}%`}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Open tickets</dt><dd className="font-semibold tabular-nums">{item.openTickets}</dd></div>
        </dl>
        <Button variant="secondary" size="sm" className="self-start" onClick={() => open(item)}>Open {item.name.split(" ")[0]}<ArrowRight className="ml-1 size-4" /></Button>
      </section>; })}
    </div>
  </>;
}

function Bars({ rows }: { rows: { id: string; label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return <ul className="flex flex-col gap-3">{rows.map((row) => <li key={row.id}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="font-medium">{row.label}</span><span className="tabular-nums text-muted-foreground">{inr(row.value)}</span></div><div className="h-2.5 bg-surface-2"><div className="h-2.5" style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: row.color }} /></div></li>)}</ul>;
}

function Analytics({ list }: { list: PortfolioCompany[] }) {
  const color = (index: number) => palette[index % palette.length];
  const measures: [string, (item: PortfolioCompany) => string][] = [["Leads", (item) => String(item.crm.leads)], ["Open deals", (item) => String(item.crm.openDeals)], ["Won deals", (item) => String(item.crm.wonDeals)], ["Lost deals", (item) => String(item.crm.lostDeals)], ["Win rate", (item) => { const rate = winRate(item); return rate === null ? "—" : `${rate}%`; }], ["Members", (item) => String(item.members)], ["Open tickets", (item) => String(item.openTickets)]];
  return <>
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Open pipeline" description="Value of deals still in play."><Bars rows={list.map((item, index) => ({ id: item.id, label: item.name, value: Number(item.crm.pipelineValue), color: color(index) }))} /></SectionCard>
      <SectionCard title="Won so far" description="Closed deals by company."><Bars rows={list.map((item, index) => ({ id: item.id, label: item.name, value: Number(item.crm.wonValue), color: color(index) }))} /></SectionCard>
    </div>
    <SectionCard title="By company" description="Counted from each company's own records.">
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.id} className="px-3 py-2">{item.name}</th>)}</tr></thead><tbody>{measures.map(([label, value]) => <tr key={label} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.id} className="px-3 py-2.5 tabular-nums">{value(item)}</td>)}</tr>)}</tbody></table></div>
    </SectionCard>
  </>;
}

function Companies({ list, onAdd }: { list: PortfolioCompany[]; onAdd: () => void }) {
  return <SectionCard title={`${list.length} ${list.length === 1 ? "company" : "companies"}`} description="Each company keeps its own people, records and settings." action={<Button size="sm" variant="secondary" onClick={onAdd}><Plus className="mr-1 size-4" />Add company</Button>}>
    <ul className="divide-y divide-border">{list.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}{item.current && <Badge variant="neutral" className="ml-2">Open now</Badge>}</p><p className="text-xs text-muted-foreground">{item.industry || "Industry not set"} · since {item.createdAt} · {item.members} member{item.members === 1 ? "" : "s"}</p></div>
      <Button size="sm" onClick={() => open(item)}>Open<ArrowRight className="ml-1 size-4" /></Button>
    </li>)}</ul>
  </SectionCard>;
}

function AddCompany({ onClose }: { onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const error = name.trim().length < 2 ? "Give the company a name." : "";
  async function save() {
    setTouched(true);
    if (error) return;
    setSaving(true);
    try {
      const created = await api<{ id: string; name: string }>("/portfolio/companies", { method: "POST", body: JSON.stringify({ name: name.trim(), industry: industry.trim() }) });
      toast.success(`${created.name} added. Opening it to finish setup.`);
      await switchTenant(created.id, "/setup");
    } catch (failure) {
      toast.error(message(failure));
      setSaving(false);
    }
  }
  return <Dialog open onOpenChange={(value) => !value && !saving && onClose()}><DialogContent><DialogHeader><DialogTitle>Add a company</DialogTitle><DialogDescription>You become its Owner. It starts empty, with its own people, records and settings, and you set it up next.</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="grid gap-1.5 text-xs text-muted-foreground">Name<Input autoFocus value={name} maxLength={160} onChange={(event) => setName(event.target.value)} /></label>
      <label className="grid gap-1.5 text-xs text-muted-foreground">Industry (optional)<Input value={industry} maxLength={120} onChange={(event) => setIndustry(event.target.value)} /></label>
      {touched && error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add company"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}
