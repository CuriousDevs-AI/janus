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
import { DocumentsCard } from "@/features/portfolio/components/documents";
import { BusinessModelSelect, CompanyEditor, entityNames, PeopleList } from "@/features/portfolio/components/company-editor";
import { TargetsForm } from "@/features/portfolio/components/targets";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { businessModels, businessName, businessOrder, focus, sells, type Measure } from "@/features/portfolio/lib/business";
import { openIn, payrollFor, useRoles, winRateText } from "@/features/portfolio/lib/companies";
import { healthName, healthTone, inr } from "@/features/portfolio/lib/format";
import type { Billing, BusinessModel, PortfolioCompany, PortfolioPeriod } from "@/features/portfolio/types";

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
  return <><CompanyTable list={list} period={period} onAdd={onAdd} onOpen={go} onEdit={(item) => canEdit(item) ? setEditing(item) : undefined} canEdit={canEdit} /><ArchivedByPlan owner={Boolean(onAdd)} />{editor}</>;
}

/** The company's own settings, in its Business Management: always this company's. The plan is the
 * account's, under Plan and billing, not the company's. */
const settingsOf = (item: PortfolioCompany) => openIn(item, "/settings?tab=workspace&view=settings&workspace=business");

function CompanyTable({ list, period, onAdd, onOpen, onEdit, canEdit }: { list: PortfolioCompany[]; period: PortfolioPeriod; onAdd?: () => void; onOpen: (id: string) => void; onEdit: (item: PortfolioCompany) => void; canEdit: (item: PortfolioCompany) => boolean }) {
  const { owns } = useRoles();
  const [query, setQuery] = React.useState("");
  const [health, setHealth] = React.useState("all");
  const [kind, setKind] = React.useState("all");
  const [sort, setSort] = React.useState<SortKey>("health");
  const [compare, setCompare] = React.useState<string[]>([]);
  const money = list.some((item) => item.books);
  const shown = list
    .filter((item) => `${item.name} ${item.industry} ${businessName(item)} ${item.registration?.legalName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((item) => health === "all" || item.health?.status === health)
    .filter((item) => kind === "all" || item.businessModel === kind)
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
        <select aria-label="Kind of business" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">Any kind of business</option>{businessOrder.filter((id) => list.some((item) => item.businessModel === id)).map((id) => <option key={id} value={id}>{businessModels[id].name}</option>)}{list.some((item) => !item.businessModel) && <option value="">Not set</option>}</select>
        <select aria-label="Sort" className="h-8 rounded-md border border-input bg-surface-2 px-2 text-[13px]" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>{sorts.filter(([key]) => money || key !== "sales").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">No company matches.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="w-8 py-2"><span className="sr-only">Compare</span></th><th className="py-2 pr-3">Company</th><th className="px-3 py-2">Health</th>{money && <th className="px-3 py-2">Sales</th>}<th className="px-3 py-2">Open pipeline</th><th className="px-3 py-2">People</th><th className="px-3 py-2">Filings past due</th><th className="py-2 pl-3" /></tr></thead>
        <tbody>{shown.map((item) => <tr key={item.id} className="border-b border-border last:border-0">
          <td className="py-2.5"><input type="checkbox" aria-label={`Compare ${item.name}`} checked={compare.includes(item.id)} disabled={!compare.includes(item.id) && compare.length >= 4} onChange={() => toggle(item.id)} /></td>
          <td className="py-2.5 pr-3"><button type="button" className="text-left font-medium text-accent hover:underline" onClick={() => onOpen(item.id)}>{item.name}</button><p className="text-xs text-muted-foreground">{businessName(item)}{item.industry ? ` · ${item.industry}` : ""}{item.current ? " · open now" : ""}</p></td>
          <td className="px-3">{item.health ? <Badge variant={healthTone[item.health.status]} title={item.health.reasons.join("\n") || "Nothing needs attention"}>{healthName[item.health.status]}</Badge> : "—"}</td>
          {money && <td className="px-3 tabular-nums">{!sells(item) ? <span className="text-xs text-muted-foreground">No sales</span> : item.books ? inr(n(item.books.current.netSales)) : "Not shared"}</td>}
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
    ["Kind of business", businessName],
    ["Health", (item) => item.health ? healthName[item.health.status] : "—"],
    ["Sales this period", (item) => !sells(item) ? "No sales" : item.books ? inr(n(item.books.current.netSales)) : "Not shared"],
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
        {owns(item) && <Button size="sm" variant="outline" title={`Opens ${item.name}'s settings`} onClick={() => settingsOf(item)}><Settings2 className="size-3.5" />Settings</Button>}
        {owns(item) && <Button size="sm" onClick={() => openIn(item)}>Open company<ArrowRight className="ml-1 size-3.5" /></Button>}
      </div>
    </div>

    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 md:flex-row md:items-start">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-foreground text-lg font-semibold text-background" aria-hidden>{item.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{item.name}</h2>{item.health && <Badge variant={healthTone[item.health.status]}>{healthName[item.health.status]}</Badge>}{item.current && <Badge variant="neutral">Open now</Badge>}</div>
        <p className="mt-0.5 text-sm text-muted-foreground">{[reg?.legalName && reg.legalName !== item.name ? reg.legalName : null, reg?.entityType ? entityNames[reg.entityType] : null, businessName(item), item.industry || null, item.companySize || null, reg?.incorporatedOn ? `founded ${reg.incorporatedOn.slice(0, 4)}` : null].filter(Boolean).join(" · ")}</p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">{contact.map(([icon, text, href], index) => <li key={index} className={`flex items-center gap-1.5 ${text ? "" : "text-muted-foreground/70"}`}>{icon}{text ? href ? <a className="text-accent hover:underline" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{text}</a> : text : "Not recorded"}</li>)}</ul>
        {reg?.registeredAddress && <p className="mt-2 text-xs text-muted-foreground">Registered office: {reg.registeredAddress}</p>}
      </div>
    </section>

    {item.health && item.health.reasons.length > 0 && <SectionCard title="Needs attention" description="From this company's own records."><ul className="grid gap-1 text-sm">{item.health.reasons.map((reason) => <li key={reason} className={item.health?.status === "red" ? "font-medium text-danger" : undefined}>• {reason}</li>)}</ul></SectionCard>}

    <FocusCard item={item} extra={[
      ...(item.books && sells(item) ? [payroll !== null
        ? { label: "Profit after salaries", value: inr(n(item.books.current.profitBeforePayroll) - payroll), detail: `Estimate · ${inr(n(item.books.current.profitBeforePayroll))} before ${inr(payroll)} of salaries` }
        : { label: "Profit before salaries", value: inr(n(item.books.current.profitBeforePayroll)), detail: "Salaries unknown: no salaries in HR" }] : []),
      ...(!item.books ? [{ label: "Leads this period", value: String(item.period.current.leads), detail: `${item.period.previous.leads} in the same days before` }, { label: "Deals won this period", value: String(item.period.current.wonDeals), detail: `Worth ${inr(n(item.period.current.wonValue))}` }] : []),
      ...(item.crm.openDeals ? [{ label: "Open pipeline", value: inr(n(item.crm.pipelineValue)), detail: `${item.crm.openDeals} open deals · win rate ${winRateText(item)}` }] : []),
    ]} period={period} />

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
        <DocumentsCard item={item} canEdit={handlesMoney(item)} onSaved={onSaved} />
        {item.complianceGaps.length > 0 && <ul className="grid gap-1 text-xs">{item.complianceGaps.map((gap) => <li key={gap.text} className={gap.kind === "missing" ? "text-warning" : "text-muted-foreground"}>{gap.kind === "missing" ? "Missing: " : "Suggested: "}{gap.text}</li>)}</ul>}
        <p className="text-sm">{pastDue(item) ? <span className="text-danger">{pastDue(item)} filing{pastDue(item) === 1 ? "" : "s"} past due and not recorded.</span> : item.complianceSetUp ? "No filing past due." : <span className="text-warning">No filings are tracked yet.</span>} <a className="text-accent hover:underline" href="/portfolio?view=compliance">Open Compliance</a></p>
      </div>
    </SectionCard>
    {owns(item) && <SectionCard title="Monthly targets" description="What you expect each month. The Overview shows progress against them."><TargetsForm item={item} onSaved={onSaved} /></SectionCard>}
  </>;
}

/** The measures that fit this kind of business, and what Janus does not record for it. */
function FocusCard({ item, extra, period }: { item: PortfolioCompany; extra: Measure[]; period: PortfolioPeriod }) {
  const { measures, notRecorded } = focus(item);
  // Without money, the measures that need it read "—" and are left out; leads and deals lead instead.
  const shown = [...(item.books ? measures : measures.filter((measure) => measure.value !== "—")), ...extra];
  return <SectionCard title={item.businessModel ? `What matters for ${businessModels[item.businessModel].name.toLowerCase()}` : "What matters for this business"} description={item.businessModel ? businessModels[item.businessModel].hint : "The kind of business is not chosen yet, so these are the measures for trading."}>
    <p className="mb-3 text-xs text-muted-foreground">{period.label}, against the same days before where a figure has one.</p>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">{shown.map((measure) => <Kpi key={measure.label} label={measure.label} value={measure.value} detail={measure.detail} />)}</div>
    {notRecorded.length > 0 && <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">{notRecorded.map((text) => <li key={text}>{text}</li>)}</ul>}
  </SectionCard>;
}

export function AddCompany({ onClose }: { onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [model, setModel] = React.useState<BusinessModel>("");
  const [saving, setSaving] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const error = name.trim().length < 2 ? "Give the company a name." : "";
  async function save() {
    setTouched(true);
    if (error) return;
    setSaving(true);
    let created: { id: string; name: string };
    try {
      created = await api("/portfolio/companies", { method: "POST", body: JSON.stringify({ name: name.trim(), industry: industry.trim(), businessModel: model }) });
    } catch (failure) {
      toast.error(message(failure));
      setSaving(false);
      return;
    }
    toast.success(`${created.name} added. Opening it to finish setup.`);
    try {
      await switchTenant(created.id, "/setup", created.name);
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
      <label className="grid gap-1.5 text-xs text-muted-foreground">Kind of business<BusinessModelSelect value={model} onChange={setModel} /><span className="text-[11px]">{model ? businessModels[model].hint : "Decides which figures lead for it: a holding company is not shown sales."}</span></label>
      <label className="grid gap-1.5 text-xs text-muted-foreground">Industry (optional)<Input value={industry} maxLength={120} placeholder="Textiles" onChange={(event) => setIndustry(event.target.value)} /></label>
      {touched && error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add company"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

/** Companies the plan holds no room for: kept as they were, not shown above, back when the plan has room. */
function ArchivedByPlan({ owner }: { owner: boolean }) {
  const billing = usePortfolioApi<Billing>(owner ? "/billing" : null);
  const archived = billing.data?.archived ?? [];
  if (!archived.length) return null;
  return <SectionCard title="Archived by your plan" description="Kept as they were, with their people and records. Nobody can open them until your plan has room; they come back on their own when you move up.">
    <ul className="flex flex-col divide-y divide-border">{archived.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0"><span className="flex items-center gap-2"><Building2 className="size-4 text-muted-foreground" aria-hidden />{item.name}</span><Badge variant="neutral">Archived by your plan</Badge></li>)}</ul>
    <Button size="sm" variant="outline" className="mt-3" asChild><a href="/portfolio?view=billing">Plan and billing</a></Button>
  </SectionCard>;
}
