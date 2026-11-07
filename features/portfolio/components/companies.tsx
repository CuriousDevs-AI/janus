"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Globe, Mail, MapPin, Pencil, Phone, Plus, Search, Settings2, Users } from "lucide-react";
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
import { CompanyEditor, entityNames, PeopleList } from "@/features/portfolio/components/company-editor";
import { TargetsForm } from "@/features/portfolio/components/targets";
import { openIn, payrollFor, useRoles, winRateText } from "@/features/portfolio/lib/companies";
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
  const [editing, setEditing] = React.useState<PortfolioCompany | null>(null);
  const { owns, handlesMoney } = useRoles();
  const go = (company: string | null) => { const next = new URLSearchParams(params.toString()); if (company) next.set("company", company); else next.delete("company"); router.push(`${pathname}?${next.toString()}`); };
  const profile = list.find((item) => item.id === chosen);
  const editor = editing && <CompanyEditor item={editing} basics={owns(editing)} onClose={() => setEditing(null)} onSaved={onSaved} />;
  const canEdit = (item: PortfolioCompany) => handlesMoney(item);
  if (profile) return <><CompanyProfile item={profile} period={period} onBack={() => go(null)} onSaved={onSaved} onEdit={canEdit(profile) ? () => setEditing(profile) : undefined} />{editor}</>;
  return <><CompanyTable list={list} period={period} onAdd={onAdd} onOpen={go} onEdit={(item) => canEdit(item) ? setEditing(item) : undefined} canEdit={canEdit} />{editor}</>;
}

/** The company's own settings, in its Business Management. */
const settingsOf = (item: PortfolioCompany) => openIn(item, "/settings?tab=workspace&view=settings&workspace=business");

function CompanyTable({ list, period, onAdd, onOpen, onEdit, canEdit }: { list: PortfolioCompany[]; period: PortfolioPeriod; onAdd?: () => void; onOpen: (id: string) => void; onEdit: (item: PortfolioCompany) => void; canEdit: (item: PortfolioCompany) => boolean }) {
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
          <td className={`px-3 tabular-nums ${pastDue(item) ? "text-danger" : item.complianceSetUp ? "" : "text-warning"}`}>{pastDue(item) || (item.complianceSetUp ? 0 : "Not set up")}</td>
          <td className="py-2.5 pl-3"><div className="flex justify-end gap-1">
            {canEdit(item) && <Button size="sm" variant="ghost" aria-label={`Edit ${item.name}`} title="Edit details" onClick={() => onEdit(item)}><Pencil className="size-3.5" /></Button>}
            {owns(item) && <Button size="sm" variant="ghost" aria-label={`${item.name} settings`} title="Company settings" onClick={() => settingsOf(item)}><Settings2 className="size-3.5" /></Button>}
            {owns(item) && <Button size="sm" variant="outline" onClick={() => openIn(item)}>Open<ArrowRight className="ml-1 size-3.5" /></Button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </SectionCard>
    {compare.length >= 2 && <Compare list={list.filter((item) => compare.includes(item.id))} period={period} onClear={() => setCompare([])} />}
    {compare.length === 1 && <p className="text-xs text-muted-foreground">Tick one more company to compare.</p>}
  </>;
}

function Compare({ list, period, onClear }: { list: PortfolioCompany[]; period: PortfolioPeriod; onClear: () => void }) {
  const rows: [string, (item: PortfolioCompany) => string][] = [
    ["Health", (item) => item.health ? healthName[item.health.status] : "—"],
    ["Sales this period", (item) => item.books ? inr(n(item.books.current.netSales)) : "Not shared"],
    ["Profit before salaries", (item) => item.books ? inr(n(item.books.current.profitBeforePayroll)) : "Not shared"],
    ["Profit after salaries (est.)", (item) => { const pay = payrollFor(item, period); return !item.books ? "Not shared" : pay === null ? "Salaries unknown" : inr(n(item.books.current.profitBeforePayroll) - pay); }],
    ["Customers owe", (item) => item.money ? inr(n(item.money.receivable)) : "Not shared"],
    ["Leads this period", (item) => String(item.period.current.leads)],
    ["Won this period", (item) => inr(n(item.period.current.wonValue))],
    ["Open pipeline", (item) => inr(n(item.crm.pipelineValue))],
    ["Win rate (won ÷ closed, all time)", (item) => winRateText(item)],
    ["People", (item) => String(item.people?.headcount ?? 0)],
    ["Approvals waiting", (item) => String(item.approvals.reduce((sum, entry) => sum + entry.count, 0))],
    ["Open tickets", (item) => String(item.openTickets)],
    ["Filings past due", (item) => String(pastDue(item))],
  ];
  return <SectionCard title={`Comparing ${list.length} companies`} description="The same measures side by side, for the period chosen above." action={<Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>}>
    <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.id} className="px-3 py-2">{item.name}</th>)}</tr></thead><tbody>{rows.map(([label, value]) => <tr key={label} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.id} className="px-3 py-2.5 tabular-nums">{value(item)}</td>)}</tr>)}</tbody></table></div>
  </SectionCard>;
}

/** One company's page: everything about it in one place, with its health, money, people and filings. */
function CompanyProfile({ item, period, onBack, onSaved, onEdit }: { item: PortfolioCompany; period: PortfolioPeriod; onBack: () => void; onSaved: () => void; onEdit?: () => void }) {
  const { owns, handlesMoney } = useRoles();
  const payroll = payrollFor(item, period);
  const reg = item.registration;
  const contact: [React.ReactNode, string | null | undefined, string?][] = [
    [<Globe key="w" className="size-3.5" />, reg?.website, reg?.website ? (reg.website.startsWith("http") ? reg.website : `https://${reg.website}`) : undefined],
    [<Mail key="e" className="size-3.5" />, reg?.email, reg?.email ? `mailto:${reg.email}` : undefined],
    [<Phone key="p" className="size-3.5" />, reg?.phone, reg?.phone ? `tel:${reg.phone.replace(/\s/g, "")}` : undefined],
    [<MapPin key="m" className="size-3.5" />, [reg?.city, reg?.state].filter(Boolean).join(", ") || null],
  ];
  const headcount = item.people?.headcount ?? 0;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="size-3.5" />All companies</Button>
      <div className="flex flex-wrap gap-2">
        {onEdit && <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="size-3.5" />Edit details</Button>}
        {owns(item) && <Button size="sm" variant="outline" onClick={() => settingsOf(item)}><Settings2 className="size-3.5" />Settings</Button>}
        {owns(item) && <Button size="sm" onClick={() => openIn(item)}>Open company<ArrowRight className="ml-1 size-3.5" /></Button>}
      </div>
    </div>

    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 md:flex-row md:items-start">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-foreground text-lg font-semibold text-background" aria-hidden>{item.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{item.name}</h2>{item.health && <Badge variant={healthTone[item.health.status]}>{healthName[item.health.status]}</Badge>}{item.current && <Badge variant="neutral">Open now</Badge>}</div>
        <p className="mt-0.5 text-sm text-muted-foreground">{[reg?.legalName && reg.legalName !== item.name ? reg.legalName : null, reg?.entityType ? entityNames[reg.entityType] : null, item.industry || "Industry not set", item.companySize || null, reg?.incorporatedOn ? `founded ${reg.incorporatedOn.slice(0, 4)}` : null].filter(Boolean).join(" · ")}</p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">{contact.map(([icon, text, href], index) => <li key={index} className={`flex items-center gap-1.5 ${text ? "" : "text-muted-foreground/70"}`}>{icon}{text ? href ? <a className="text-accent hover:underline" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{text}</a> : text : "Not recorded"}</li>)}</ul>
        {reg?.registeredAddress && <p className="mt-2 text-xs text-muted-foreground">Registered office: {reg.registeredAddress}</p>}
      </div>
    </section>

    {item.health && item.health.reasons.length > 0 && <SectionCard title="Needs attention" description="From this company's own records."><ul className="grid gap-1 text-sm">{item.health.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></SectionCard>}

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {item.books ? <Kpi label={`Sales, ${period.label}`} value={inr(n(item.books.current.netSales))} detail={`${inr(n(item.books.previous.netSales))} in the same days before`} /> : <Kpi label="Leads this period" value={String(item.period.current.leads)} detail={`${item.period.previous.leads} in the same days before`} />}
      {item.books ? payroll !== null
        ? <Kpi label="Profit after salaries" value={inr(n(item.books.current.profitBeforePayroll) - payroll)} detail={`Estimate · ${inr(n(item.books.current.profitBeforePayroll))} before ${inr(payroll)} of salaries`} />
        : <Kpi label="Profit before salaries" value={inr(n(item.books.current.profitBeforePayroll))} detail="Salaries unknown: no salaries in HR" /> : <Kpi label="Deals won this period" value={String(item.period.current.wonDeals)} detail={`Worth ${inr(n(item.period.current.wonValue))}`} />}
      <Kpi label="Open pipeline" value={inr(n(item.crm.pipelineValue))} detail={`${item.crm.openDeals} open deals · win rate ${winRateText(item)}`} />
      {item.money ? <Kpi label="Customers owe" value={inr(n(item.money.receivable))} detail={n(item.money.overdue) ? `${inr(n(item.money.overdue))} past due` : "Nothing past due"} /> : <Kpi label="Open tickets" value={String(item.openTickets)} detail="Customer support" />}
    </div>

    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <SectionCard title="Founders and directors" description="Who started and runs the company." action={onEdit && <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="size-3.5" />Edit</Button>}>
        <PeopleList people={reg?.directors ?? []} />
      </SectionCard>
      <SectionCard title="Team" description="Everyone in the company.">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5" />Total people</dt><dd className="text-2xl font-semibold tabular-nums">{headcount}</dd><dd className="text-xs text-muted-foreground">Employee records in HR</dd></div>
          <div><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="size-3.5" />Using Janus</dt><dd className="text-2xl font-semibold tabular-nums">{item.members}</dd><dd className="text-xs text-muted-foreground">Active logins</dd></div>
          <div><dt className="text-xs text-muted-foreground">On leave today</dt><dd className="font-semibold tabular-nums">{item.people?.onLeaveToday ?? 0}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Waiting on a decision</dt><dd className="font-semibold tabular-nums">{(item.people?.pendingLeave ?? 0) + (item.people?.pendingClaims ?? 0)} leave and claims</dd></div>
          {handlesMoney(item) && n(item.people?.monthlyPayroll) > 0 && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Monthly salaries on record</dt><dd className="font-semibold tabular-nums">{inr(n(item.people?.monthlyPayroll))}</dd></div>}
        </dl>
      </SectionCard>
    </div>

    {item.customers.length > 0 && <SectionCard title="Biggest customers" description="Sales before GST in the period, and in the same days before.">
      <ul className="divide-y divide-border">{item.customers.map((customer) => <li key={customer.name} className="flex justify-between gap-3 py-2 text-sm"><span>{customer.name}</span><span className="tabular-nums text-muted-foreground">{inr(n(customer.current))} <span className="text-xs">({inr(n(customer.previous))} before)</span></span></li>)}</ul>
    </SectionCard>}

    <SectionCard title="Registration and filings" description="Its legal identity, and what it must file.">
      <div className="grid gap-3">
        <RegistrationCard item={item} canEdit={handlesMoney(item)} onSaved={onSaved} />
        {item.complianceGaps.length > 0 && <ul className="grid gap-1 text-xs">{item.complianceGaps.map((gap) => <li key={gap.text} className={gap.kind === "missing" ? "text-warning" : "text-muted-foreground"}>{gap.kind === "missing" ? "Missing: " : "Suggested: "}{gap.text}</li>)}</ul>}
        <p className="text-sm">{pastDue(item) ? <span className="text-danger">{pastDue(item)} filing{pastDue(item) === 1 ? "" : "s"} past due and not recorded.</span> : item.complianceSetUp ? "No filing past due." : <span className="text-warning">No filings are tracked yet.</span>} <a className="text-accent hover:underline" href="/portfolio?view=compliance">Open Compliance</a></p>
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
