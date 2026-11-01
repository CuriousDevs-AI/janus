"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
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
import type { PortfolioAccessResult, PortfolioCompany, PortfolioPerson, PortfolioRole, PortfolioSummary } from "@/lib/api/types";
import { useSession } from "@/components/auth/session-provider";
import { roleLabel } from "@/lib/access";

const titles: Record<string, [string, string]> = {
  overview: ["Overview", "Every company you own, at a glance."],
  analytics: ["Analytics", "The same measures for every company, side by side."],
  finance: ["Finance", "Money in and out, by company."],
  companies: ["Companies", "Add a company or open one."],
  intelligence: ["Janus Intelligence", "Ask a question across all your companies."],
  notifications: ["Notifications", "What needs you, from every company."],
  people: ["Portfolio access", "Who else sees these companies together, and how much."],
};
const palette = ["#2563eb", "#d97706", "#16a34a", "#9333ea", "#dc2626"];

/** Rupees the way an Indian owner reads them: ₹12,500 below a lakh, then ₹4.2L and ₹1.3Cr. */
export function inr(value: number) {
  if (Math.abs(value) >= 1e7) return `₹${(value / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (Math.abs(value) >= 1e5) return `₹${(value / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}
const winRate = (item: PortfolioCompany) => { const closed = item.crm.wonDeals + item.crm.lostDeals; return closed ? Math.round((item.crm.wonDeals / closed) * 100) : null; };
/** Opening a company is for its Owner; a group role reads the Portfolio and has no workspace inside. */
const useOwns = () => { const session = useSession(); return (item: PortfolioCompany) => session.tenants.some((tenant) => tenant.id === item.id && tenant.role === "owner"); };
const open = (item: PortfolioCompany, to = businessHome) => item.current ? window.location.assign(to) : switchTenant(item.id, to).catch((error) => toast.error(message(error)));

/** The Portfolio for a real account: every company the person owns, as the server reports it. */
export function LivePortfolio() {
  const params = useSearchParams();
  const view = params.get("view") ?? "overview";
  const [adding, setAdding] = React.useState(params.get("add") === "1");
  const summary = useApi<PortfolioSummary>("/portfolio/summary");
  const session = useSession();
  // Only an Owner adds companies and shares the Portfolio; a group role only reads it.
  const owner = session.tenants.some((item) => item.role === "owner" && item.status === "active");
  const [title, base] = titles[view] ?? titles.overview;
  const description = !owner && view === "overview" ? "Every company shared with you, at a glance." : base;
  const list = summary.data?.companies ?? [];
  const withMoney = list.filter((item): item is WithMoney => item.money !== null);
  return <div className="mx-auto flex max-w-[1240px] flex-col">
    <PageHeader title={title} description={description} actions={owner && list.length > 0 && <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-4" />Add company</Button>} />
    <div className="flex flex-col gap-6 px-6 pb-10">
      {summary.loading ? <p className="text-sm text-muted-foreground" role="status">Loading your companies…</p>
        : summary.error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">{summary.error}<Button size="sm" variant="secondary" onClick={summary.reload}>Try again</Button></div>
        : list.length === 0 ? <p className="text-sm text-muted-foreground" role="status">The Portfolio shows the companies you own, and those an Owner shared with you. There are none yet.</p>
        : view === "analytics" ? <Analytics list={list} />
        : view === "finance" ? withMoney.length === 0 ? <SectionCard title="Money is not shared with you" description="Your role covers sales and people, not money."><p className="text-sm text-muted-foreground">Ask the Owner for Group finance if you need what customers owe and what is due to suppliers.</p></SectionCard> : <Finance list={withMoney} hidden={list.length - withMoney.length} />
        : view === "companies" ? <Companies list={list} onAdd={owner ? () => setAdding(true) : undefined} />
        : view === "people" ? owner ? <Access list={list} /> : <SectionCard title="Portfolio access" description="Only an Owner shares the Portfolio."><p className="text-sm text-muted-foreground">The Owner decides who else sees these companies.</p></SectionCard>
        : view === "overview" ? <Overview list={list} owner={owner} />
        : <SectionCard title={title} description="Not on real accounts yet."><p className="text-sm text-muted-foreground">This view works in the preview only for now. Overview, Analytics, Finance, Companies and Portfolio access show your real companies.</p></SectionCard>}
    </div>
    {adding && <AddCompany onClose={() => setAdding(false)} />}
  </div>;
}

const Kpi = ({ label, value, detail }: { label: string; value: string; detail: string }) => <div className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;

function Overview({ list, owner }: { list: PortfolioCompany[]; owner: boolean }) {
  const owns = useOwns();
  const sum = (pick: (item: PortfolioCompany) => number) => list.reduce((total, item) => total + pick(item), 0);
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Kpi label="Companies" value={String(list.length)} detail={owner ? "Owned or shared with you" : "Shared with you"} />
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
        {owns(item) && <Button variant="secondary" size="sm" className="self-start" onClick={() => open(item)}>Open {item.name.split(" ")[0]}<ArrowRight className="ml-1 size-4" /></Button>}
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

type WithMoney = PortfolioCompany & { money: NonNullable<PortfolioCompany["money"]> };

function Finance({ list, hidden }: { list: WithMoney[]; hidden: number }) {
  const owns = useOwns();
  const sum = (pick: (item: WithMoney) => string) => list.reduce((total, item) => total + Number(pick(item)), 0);
  const thisMonth = sum((item) => item.money.collectedThisMonth);
  const lastMonth = sum((item) => item.money.collectedLastMonth);
  const rows: [string, (item: WithMoney) => string][] = [
    ["Customers owe", (item) => inr(Number(item.money.receivable))],
    ["Overdue", (item) => item.money.overdueInvoices ? `${inr(Number(item.money.overdue))} · ${item.money.overdueInvoices} invoice${item.money.overdueInvoices === 1 ? "" : "s"}` : "None"],
    ["Late 1–30 days", (item) => inr(Number(item.money.ageing.days0to30))],
    ["Late 31–60 days", (item) => inr(Number(item.money.ageing.days31to60))],
    ["Late over 60 days", (item) => inr(Number(item.money.ageing.over60))],
    ["You owe suppliers", (item) => inr(Number(item.money.payable))],
    ["Bills due in 7 days", (item) => inr(Number(item.money.payableDueThisWeek))],
    ["Collected this month", (item) => inr(Number(item.money.collectedThisMonth))],
    ["Collected last month", (item) => inr(Number(item.money.collectedLastMonth))],
  ];
  return <>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Customers owe" value={inr(sum((item) => item.money.receivable))} detail="Unpaid invoices, all companies" />
      <Kpi label="Overdue" value={inr(sum((item) => item.money.overdue))} detail={`${list.reduce((total, item) => total + item.money.overdueInvoices, 0)} invoices past due`} />
      <Kpi label="Bills due in 7 days" value={inr(sum((item) => item.money.payableDueThisWeek))} detail={`${inr(sum((item) => item.money.payable))} owed to suppliers in all`} />
      <Kpi label="Collected this month" value={inr(thisMonth)} detail={`${inr(lastMonth)} last month`} />
    </div>
    <SectionCard title="By company" description={`From each company's invoices, payments, approved credit notes and bills. Bank balances are not connected, so Janus does not show cash.${hidden ? ` ${hidden} more ${hidden === 1 ? "company does" : "companies do"} not share money with your role.` : ""}`}>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Measure</th>{list.map((item) => <th key={item.id} className="px-3 py-2">{item.name}</th>)}</tr></thead><tbody>{rows.map(([label, value]) => <tr key={label} className="border-b border-border last:border-0"><td className="py-2.5 pr-4 font-medium">{label}</td>{list.map((item) => <td key={item.id} className="px-3 py-2.5 tabular-nums">{value(item)}</td>)}</tr>)}</tbody></table></div>
      <div className="mt-3 flex flex-wrap gap-2">{list.filter(owns).map((item) => <Button key={item.id} size="sm" variant="outline" onClick={() => open(item, "/workspace/finance-accounting?workspace=finance-accounting")}>Open {item.name.split(" ")[0]} Finance</Button>)}</div>
    </SectionCard>
  </>;
}

function Companies({ list, onAdd }: { list: PortfolioCompany[]; onAdd?: () => void }) {
  const owns = useOwns();
  return <SectionCard title={`${list.length} ${list.length === 1 ? "company" : "companies"}`} description="Each company keeps its own people, records and settings." action={onAdd && <Button size="sm" variant="secondary" onClick={onAdd}><Plus className="mr-1 size-4" />Add company</Button>}>
    <ul className="divide-y divide-border">{list.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}{item.current && <Badge variant="neutral" className="ml-2">Open now</Badge>}</p><p className="text-xs text-muted-foreground">{item.industry || "Industry not set"} · since {item.createdAt} · {item.members} member{item.members === 1 ? "" : "s"}</p></div>
      {owns(item) && <Button size="sm" onClick={() => open(item)}>Open<ArrowRight className="ml-1 size-4" /></Button>}
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

const accessRoles: [PortfolioRole, string][] = [["group_finance", "Sees every view here, money included. Cannot change anything in the companies."], ["group_analyst", "Sees sales, people and support here, not money. Cannot change anything in the companies."], ["owner", "A co-owner: full control of each company shared, including adding people."]];
/** Joins what one call did into a sentence, saying which companies were left out and why. */
const outcome = (result: PortfolioAccessResult, verb: string) => [result.done.length ? `${verb} ${result.done.join(", ")}.` : "", ...result.skipped.map((item) => `${item.company}: ${item.reason}`)].filter(Boolean).join(" ");

function Access({ list }: { list: PortfolioCompany[] }) {
  const people = useApi<{ people: PortfolioPerson[] }>("/portfolio/access");
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<PortfolioPerson | null>(null);
  return <>
    <SectionCard title="Who else sees the Portfolio" description="Each person joins the companies you choose with the role you give them, from an email invitation." action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-4" />Add person</Button>}>
      {people.loading ? <p className="text-sm text-muted-foreground" role="status">Loading…</p>
        : people.error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">{people.error}<Button size="sm" variant="secondary" onClick={people.reload}>Try again</Button></div>
        : (people.data?.people.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">Only you so far.</p>
        : <ul className="divide-y divide-border">{people.data!.people.map((person) => <li key={person.email} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{person.name ?? person.email}{person.name && <span className="font-normal text-muted-foreground"> · {person.email}</span>}</p>
            <p className="text-xs text-muted-foreground">{person.companies.map((item) => `${item.name} (${roleLabel(item.role)}${item.status === "invited" ? ", invited" : ""})`).join(" · ")}</p></div>
          <Button size="sm" variant="ghost" aria-label={`Remove ${person.name ?? person.email}`} onClick={() => setRemoving(person)}><Trash2 className="size-4" /></Button>
        </li>)}</ul>}
    </SectionCard>
    <SectionCard title="What each role sees" description="Everyone sees only the companies shared with them."><dl className="grid gap-3 md:grid-cols-3">{accessRoles.map(([role, detail]) => <div key={role} className="border border-border bg-surface-2 p-3"><dt className="text-sm font-medium">{roleLabel(role)}</dt><dd className="mt-1 text-xs text-muted-foreground">{detail}</dd></div>)}</dl></SectionCard>
    {adding && <AddPerson list={list} onClose={() => setAdding(false)} onDone={people.reload} />}
    {removing && <RemovePerson person={removing} onClose={() => setRemoving(null)} onDone={people.reload} />}
  </>;
}

function AddPerson({ list, onClose, onDone }: { list: PortfolioCompany[]; onClose: () => void; onDone: () => void }) {
  const session = useSession();
  // Only companies this person owns can be shared from here.
  const owned = list.filter((item) => session.tenants.some((tenant) => tenant.id === item.id && tenant.role === "owner"));
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<PortfolioRole>("group_finance");
  const [companies, setCompanies] = React.useState<string[]>(owned.map((item) => item.id));
  const [saving, setSaving] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const error = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? "Enter a valid email." : companies.length === 0 ? "Choose at least one company." : "";
  async function save() {
    setTouched(true);
    if (error) return;
    setSaving(true);
    try {
      const result = await api<PortfolioAccessResult>("/portfolio/access", { method: "POST", body: JSON.stringify({ email: email.trim(), role, companies }) });
      (result.done.length ? toast.success : toast.error)(outcome(result, "Invitation sent for"));
      onDone();
      onClose();
    } catch (failure) {
      toast.error(message(failure));
      setSaving(false);
    }
  }
  return <Dialog open onOpenChange={(value) => !value && !saving && onClose()}><DialogContent><DialogHeader><DialogTitle>Add a person</DialogTitle><DialogDescription>They get one email invitation for each company you choose.</DialogDescription></DialogHeader>
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="grid gap-1.5 text-xs text-muted-foreground">Email<Input type="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="grid gap-1.5 text-xs text-muted-foreground">Role<select className="h-9 border border-border bg-surface px-3 text-sm text-foreground" value={role} onChange={(event) => setRole(event.target.value as PortfolioRole)}>{accessRoles.map(([value]) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>
      <fieldset className="grid gap-1.5"><legend className="mb-1 text-xs text-muted-foreground">Companies</legend>{owned.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={companies.includes(item.id)} onChange={() => setCompanies(companies.includes(item.id) ? companies.filter((id) => id !== item.id) : [...companies, item.id])} />{item.name}</label>)}</fieldset>
      {touched && error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Sending…" : "Send invitations"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

function RemovePerson({ person, onClose, onDone }: { person: PortfolioPerson; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = React.useState(false);
  async function remove() {
    setSaving(true);
    try {
      const result = await api<PortfolioAccessResult>("/portfolio/access/remove", { method: "POST", body: JSON.stringify({ email: person.email }) });
      (result.done.length ? toast.success : toast.error)(outcome(result, "Access removed in") || "Nothing to remove.");
      onDone();
      onClose();
    } catch (failure) {
      toast.error(message(failure));
      setSaving(false);
    }
  }
  return <Dialog open onOpenChange={(value) => !value && !saving && onClose()}><DialogContent><DialogHeader><DialogTitle>Remove {person.name ?? person.email}?</DialogTitle><DialogDescription>Their group role ends in every company you own, and open invitations are withdrawn. A co-owner stays; change ownership inside the company instead.</DialogDescription></DialogHeader>
    <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Keep access</Button><Button variant="destructive" disabled={saving} onClick={() => void remove()}>{saving ? "Removing…" : "Remove access"}</Button></DialogFooter></DialogContent></Dialog>;
}
