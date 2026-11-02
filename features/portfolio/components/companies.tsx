"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { switchTenant } from "@/lib/live-company";
import { Kpi } from "@/features/portfolio/components/figures";
import { RegistrationCard } from "@/features/portfolio/components/compliance";
import { TargetsForm } from "@/features/portfolio/components/targets";
import { openIn, payrollFor, useRoles, winRate } from "@/features/portfolio/lib/companies";
import { healthName, healthTone, inr } from "@/features/portfolio/lib/format";
import type { PortfolioCompany, PortfolioPeriod } from "@/features/portfolio/types";

const n = (value: string | null | undefined) => Number(value ?? 0);
const healthOrder = { red: 0, amber: 1, green: 2 } as const;
type SortKey = "name" | "health" | "sales" | "pipeline" | "people";
const sorts: [SortKey, string][] = [["health", "Needs attention first"], ["name", "Name"], ["sales", "Sales"], ["pipeline", "Open pipeline"], ["people", "People"]];
const pastDue = (item: PortfolioCompany) => item.compliance.filter((due) => due.status === "overdue").length;

/** Every company in a table to search, sort and compare; a company's own page opens from its name. */
export function Companies({ list, period, onAdd, onSaved }: { list: PortfolioCompany[]; period: PortfolioPeriod; onAdd?: () => void; onSaved: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chosen = params.get("company");
  const go = (company: string | null) => { const next = new URLSearchParams(params.toString()); if (company) next.set("company", company); else next.delete("company"); router.push(`${pathname}?${next.toString()}`); };
  const profile = list.find((item) => item.id === chosen);
  if (profile) return <CompanyProfile item={profile} period={period} onBack={() => go(null)} onSaved={onSaved} />;
  return <CompanyTable list={list} onAdd={onAdd} onOpen={go} />;
}

function CompanyTable({ list, onAdd, onOpen }: { list: PortfolioCompany[]; onAdd?: () => void; onOpen: (id: string) => void }) {
  const { owns } = useRoles();
  const [query, setQuery] = React.useState("");
  const [health, setHealth] = React.useState("all");
  const [sort, setSort] = React.useState<SortKey>("health");
  const [compare, setCompare] = React.useState<string[]>([]);
  const money = list.some((item) => item.books);
  const shown = list
    .filter((item) => `${item.name} ${item.industry} ${item.registration?.legalName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((item) => health === "all" || item.health?.status === health)
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name)
      : sort === "health" ? (healthOrder[a.health?.status ?? "green"] - healthOrder[b.health?.status ?? "green"]) || a.name.localeCompare(b.name)
      : sort === "sales" ? n(b.books?.current.netSales) - n(a.books?.current.netSales)
      : sort === "pipeline" ? n(b.crm.pipelineValue) - n(a.crm.pipelineValue)
      : (b.people?.headcount ?? 0) - (a.people?.headcount ?? 0));
  const toggle = (id: string) => setCompare((items) => items.includes(id) ? items.filter((item) => item !== id) : items.length >= 4 ? items : [...items, id]);
  return <>
    <SectionCard title={`${list.length} ${list.length === 1 ? "company" : "companies"}`} description="Each keeps its own people, records and settings. Open a name for its page; tick two to four to compare." action={onAdd && <Button size="sm" onClick={onAdd}><Plus className="mr-1 size-4" />Add company</Button>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input aria-label="Search companies" className="pl-8" placeholder="Search by name or industry" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <select aria-label="Health" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={health} onChange={(event) => setHealth(event.target.value)}><option value="all">Any health</option><option value="red">Needs you</option><option value="amber">Watch</option><option value="green">On track</option></select>
        <select aria-label="Sort" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>{sorts.filter(([key]) => money || key !== "sales").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">No company matches.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="w-8 py-2"><span className="sr-only">Compare</span></th><th className="py-2 pr-3">Company</th><th className="px-3 py-2">Health</th>{money && <th className="px-3 py-2">Sales</th>}<th className="px-3 py-2">Open pipeline</th><th className="px-3 py-2">People</th><th className="px-3 py-2">Filings past due</th><th className="py-2 pl-3" /></tr></thead>
        <tbody>{shown.map((item) => <tr key={item.id} className="border-b border-border last:border-0">
          <td className="py-2.5"><input type="checkbox" aria-label={`Compare ${item.name}`} checked={compare.includes(item.id)} disabled={!compare.includes(item.id) && compare.length >= 4} onChange={() => toggle(item.id)} /></td>
          <td className="py-2.5 pr-3"><button type="button" className="text-left font-medium text-accent hover:underline" onClick={() => onOpen(item.id)}>{item.name}</button><p className="text-xs text-muted-foreground">{item.industry || "Industry not set"}{item.current ? " · open now" : ""}</p></td>
          <td className="px-3">{item.health ? <Badge variant={healthTone[item.health.status]} title={item.health.reasons.join("\n") || "Nothing needs attention"}>{healthName[item.health.status]}</Badge> : "—"}</td>
          {money && <td className="px-3 tabular-nums">{item.books ? inr(n(item.books.current.netSales)) : "Not shared"}</td>}
          <td className="px-3 tabular-nums">{inr(n(item.crm.pipelineValue))}</td>
          <td className="px-3 tabular-nums">{item.people?.headcount ?? 0}</td>
          <td className={`px-3 tabular-nums ${pastDue(item) ? "text-danger" : ""}`}>{pastDue(item)}</td>
          <td className="py-2.5 pl-3 text-right">{owns(item) && <Button size="sm" variant="ghost" onClick={() => openIn(item)}>Open<ArrowRight className="ml-1 size-3.5" /></Button>}</td>
        </tr>)}</tbody>
      </table></div>}
    </SectionCard>
    {compare.length >= 2 && <Compare list={list.filter((item) => compare.includes(item.id))} onClear={() => setCompare([])} />}
    {compare.length === 1 && <p className="text-xs text-muted-foreground">Tick one more company to compare.</p>}
  </>;
}

function Compare({ list, onClear }: { list: PortfolioCompany[]; onClear: () => void }) {
  const rows: [string, (item: PortfolioCompany) => string][] = [
    ["Health", (item) => item.health ? healthName[item.health.status] : "—"],
    ["Sales this period", (item) => item.books ? inr(n(item.books.current.netSales)) : "Not shared"],
    ["Profit before salaries", (item) => item.books ? inr(n(item.books.current.profitBeforePayroll)) : "Not shared"],
    ["Customers owe", (item) => item.money ? inr(n(item.money.receivable)) : "Not shared"],
    ["Leads this period", (item) => String(item.period.current.leads)],
    ["Won this period", (item) => inr(n(item.period.current.wonValue))],
    ["Open pipeline", (item) => inr(n(item.crm.pipelineValue))],
    ["Win rate", (item) => { const rate = winRate(item); return rate === null ? "—" : `${rate}%`; }],
    ["People", (item) => String(item.people?.headcount ?? 0)],
    ["Approvals waiting", (item) => String(item.approvals.reduce((sum, entry) => sum + entry.count, 0))],
    ["Open tickets", (item) => String(item.openTickets)],
    ["Filings past due", (item) => String(pastDue(item))],
  ];
  return <SectionCard title={`Comparing ${list.length} companies`} description="The same measures side by side, for the period chosen above." action={<Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>}>
    <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.id} className="px-3 py-2">{item.name}</th>)}</tr></thead><tbody>{rows.map(([label, value]) => <tr key={label} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.id} className="px-3 py-2.5 tabular-nums">{value(item)}</td>)}</tr>)}</tbody></table></div>
  </SectionCard>;
}

/** One company's page: who it is, how it is doing, what it must file, its targets, and ways in. */
function CompanyProfile({ item, period, onBack, onSaved }: { item: PortfolioCompany; period: PortfolioPeriod; onBack: () => void; onSaved: () => void }) {
  const { owns, handlesMoney } = useRoles();
  const payroll = payrollFor(item, period);
  const rate = winRate(item);
  const links: [string, string][] = [["Business overview", "/settings?tab=workspace&view=overview&workspace=business"], ["Finance", "/workspace/finance-accounting?workspace=finance-accounting"], ["Leads", "/leads?workspace=crm-sales"], ["People", "/workspace/hr-people?workspace=hr-people"], ["Tickets", "/tickets?workspace=customer-support"]];
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="size-3.5" />All companies</Button>
      {owns(item) && <div className="flex flex-wrap gap-2">{links.map(([label, to]) => <Button key={label} size="sm" variant="outline" onClick={() => openIn(item, to)}>{label}</Button>)}</div>}
    </div>
    <SectionCard title={item.name} description={`${item.registration?.legalName && item.registration.legalName !== item.name ? `${item.registration.legalName} · ` : ""}${item.industry || "Industry not set"} · on Janus since ${item.createdAt} · ${item.members} member${item.members === 1 ? "" : "s"}`} action={item.health && <Badge variant={healthTone[item.health.status]}>{healthName[item.health.status]}</Badge>}>
      {item.health && item.health.reasons.length > 0 ? <ul className="grid gap-1 text-sm">{item.health.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nothing needs attention here.</p>}
    </SectionCard>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {item.books ? <Kpi label={`Sales, ${period.label}`} value={inr(n(item.books.current.netSales))} detail={`${inr(n(item.books.previous.netSales))} in the same days before`} /> : <Kpi label="Sales" value="—" detail="Money is not shared with your role" />}
      {item.books ? <Kpi label="Profit before salaries" value={inr(n(item.books.current.profitBeforePayroll))} detail={payroll !== null ? `About ${inr(n(item.books.current.profitBeforePayroll) - payroll)} after salaries (estimate)` : "Salaries not on record"} /> : <Kpi label="Leads this period" value={String(item.period.current.leads)} detail={`${item.period.previous.leads} in the same days before`} />}
      <Kpi label="Open pipeline" value={inr(n(item.crm.pipelineValue))} detail={`${item.crm.openDeals} open deals · win rate ${rate === null ? "—" : `${rate}%`}`} />
      <Kpi label="People" value={String(item.people?.headcount ?? 0)} detail={`${item.people?.onLeaveToday ?? 0} on leave today · ${item.people?.pendingLeave ?? 0} leave requests waiting`} />
    </div>
    {item.customers.length > 0 && <SectionCard title="Biggest customers" description="Sales before GST in the period, and in the same days before.">
      <ul className="divide-y divide-border">{item.customers.map((customer) => <li key={customer.name} className="flex justify-between gap-3 py-2 text-sm"><span>{customer.name}</span><span className="tabular-nums text-muted-foreground">{inr(n(customer.current))} <span className="text-xs">({inr(n(customer.previous))} before)</span></span></li>)}</ul>
    </SectionCard>}
    <SectionCard title="Registration and filings" description="What the company is, and what it must file.">
      <div className="grid gap-3">
        <RegistrationCard item={item} canEdit={handlesMoney(item)} onSaved={onSaved} />
        <p className="text-sm">{pastDue(item) ? <span className="text-danger">{pastDue(item)} filing{pastDue(item) === 1 ? "" : "s"} past due and not recorded.</span> : "No filing past due."} <a className="text-accent hover:underline" href="/portfolio?view=compliance">Open Compliance</a></p>
      </div>
    </SectionCard>
    {owns(item) && <SectionCard title="Monthly targets" description="What you expect each month. The Overview shows progress against them."><TargetsForm item={item} onSaved={onSaved} /></SectionCard>}
  </>;
}

export function AddCompany({ onClose }: { onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const error = name.trim().length < 2 ? "Give the company a name." : "";
  async function save() {
    setTouched(true);
    if (error) return;
    setSaving(true);
    let created: { id: string; name: string };
    try {
      created = await api("/portfolio/companies", { method: "POST", body: JSON.stringify({ name: name.trim(), industry: industry.trim() }) });
    } catch (failure) {
      toast.error(message(failure));
      setSaving(false);
      return;
    }
    toast.success(`${created.name} added. Opening it to finish setup.`);
    try {
      await switchTenant(created.id, "/setup");
    } catch (failure) {
      // The company exists, so the form must not offer to add it again. A full load lists it everywhere,
      // the switcher included, since the session's companies are read once per load.
      toast.error(`${created.name} was added, but could not be opened yet. ${message(failure)}`);
      window.location.assign("/portfolio?view=companies"); // eslint-disable-line @next/next/no-location-assign-relative-destination
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
