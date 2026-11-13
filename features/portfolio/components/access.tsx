"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { roleLabel } from "@/lib/access";
import { api, message } from "@/lib/api/client";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { useRoles } from "@/features/portfolio/lib/companies";
import type { PortfolioAccessResult, PortfolioCompany, PortfolioPerson, PortfolioRole } from "@/features/portfolio/types";

/** The six Portfolio roles, and Group finance kept for people it was shared with before. Each is
 * held company by company, so its scope is the companies chosen. */
const accessRoles: [PortfolioRole, string][] = [
  ["group_analyst", "Read-only. Sees leads, deals, people, support and compliance, including FEMA and filing risks. Not money from the books: sales, costs, profit and what is owed. Cannot change anything."],
  ["group_finance", "Sees every view here, money included. Cannot change anything in the companies."],
  ["operations_manager", "Sees the Portfolio without money, and in each company runs stock, projects and approvals."],
  ["finance_manager", "Sees the Portfolio with money, and in each company records bills and decides approvals."],
  ["company_admin", "Runs the company: its people, settings and workspaces, and sees it on the Portfolio with money."],
  ["group_admin", "Portfolio administrator: sees every company shared, money included, and shares the Portfolio with view roles. Owns nothing."],
  ["owner", "A co-owner: full control of each company shared, including adding people."],
];
/** What an administrator may give: only roles that can do no more than theirs. */
const ADMIN_GIVES: PortfolioRole[] = ["group_analyst", "group_finance"];
/** Joins what one call did into a sentence, saying which companies were left out and why. */
const outcome = (result: PortfolioAccessResult, verb: string) => [result.done.length ? `${verb} ${result.done.join(", ")}.` : "", ...result.skipped.map((item) => `${item.company}: ${item.reason}`)].filter(Boolean).join(" ");

/** Who else sees the Portfolio. Only an Owner opens this view. */
export function Access({ list, owner = true }: { list: PortfolioCompany[]; owner?: boolean }) {
  const router = useRouter();
  const people = usePortfolioApi<{ people: PortfolioPerson[] }>("/portfolio/access");
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<PortfolioPerson | null>(null);
  const [find, setFind] = React.useState("");
  const [onlyRole, setOnlyRole] = React.useState<PortfolioRole | "invited" | null>(null);
  const everyone = people.data?.people ?? [];
  const holds = (role: PortfolioRole) => everyone.filter((person) => person.companies.some((item) => item.role === role)).length;
  const waiting = everyone.filter((person) => person.companies.some((item) => item.status === "invited")).length;
  const term = find.trim().toLowerCase();
  const shown = everyone.filter((person) => (!term || `${person.name ?? ""} ${person.email} ${person.companies.map((item) => item.name).join(" ")}`.toLowerCase().includes(term))
    && (!onlyRole || person.companies.some((item) => onlyRole === "invited" ? item.status === "invited" : item.role === onlyRole)));
  const chip = (active: boolean) => `rounded-full border px-2.5 py-1 text-xs transition-colors ${active ? "border-accent bg-accent-muted text-accent" : "border-border hover:bg-surface-2"}`;
  const given = accessRoles.filter(([role]) => holds(role) > 0);
  return <>
    <SectionCard title="Who else sees the Portfolio" description="Each person joins the companies you choose with the role you give them, from an email invitation." action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-4" />Add person</Button>}>
      {people.loading ? <div role="status" aria-label="Loading" className="h-40 animate-pulse rounded-md bg-surface-2" />
        : people.error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">{people.error}<Button size="sm" variant="secondary" onClick={people.reload}>Try again</Button></div>
        : everyone.length === 0 ? <div className="flex flex-col items-start gap-2"><p className="text-sm text-muted-foreground">Only you so far. Share with your finance team, a CA or an advisor, with only the companies they need.</p><Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="size-3.5" />Add the first person</Button></div>
        : <div className="flex flex-col gap-3">
          {everyone.length > 3 && <label className="relative block max-w-sm"><span className="sr-only">Find a person</span><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={find} onChange={(event) => setFind(event.target.value)} placeholder="Find by name, email or company" className="pl-8" /></label>}
          {(given.length > 1 || waiting > 0) && <div role="group" aria-label="Show people with" className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={!onlyRole} onClick={() => setOnlyRole(null)} className={chip(!onlyRole)}>Everyone <span className="tabular-nums text-muted-foreground">{everyone.length}</span></button>
            {given.map(([role]) => <button key={role} type="button" aria-pressed={onlyRole === role} onClick={() => setOnlyRole(onlyRole === role ? null : role)} className={chip(onlyRole === role)}>{roleLabel(role)} <span className="tabular-nums text-muted-foreground">{holds(role)}</span></button>)}
            {waiting > 0 && <button type="button" aria-pressed={onlyRole === "invited"} onClick={() => setOnlyRole(onlyRole === "invited" ? null : "invited")} className={chip(onlyRole === "invited")}>Invitation open <span className="tabular-nums text-muted-foreground">{waiting}</span></button>}
          </div>}
          {shown.length === 0 ? <p className="text-sm text-muted-foreground">Nobody matches. <button type="button" className="text-accent hover:underline" onClick={() => { setFind(""); setOnlyRole(null); }}>Show everyone</button></p>
          : <ul className="divide-y divide-border">{shown.map((person) => <li key={person.email} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold uppercase text-accent">{(person.name ?? person.email).split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</span>
              <div className="min-w-0"><p className="truncate text-sm font-medium">{person.name ?? person.email}{person.name && <span className="font-normal text-muted-foreground"> · {person.email}</span>}</p>
                <ul className="mt-1 flex flex-wrap gap-1">{person.companies.map((item) => <li key={item.id} className={`rounded-md border px-1.5 py-0.5 text-[11px] ${item.status === "invited" ? "border-dashed border-warning/50 text-warning" : "border-border text-muted-foreground"}`} title={item.status === "invited" ? "Invitation sent, not accepted yet" : undefined}><span className="font-medium text-foreground">{item.name}</span> · {roleLabel(item.role)}{item.status === "invited" ? " · invited" : ""}</li>)}</ul></div>
            </div>
            <Button size="sm" variant="ghost" aria-label={`Remove ${person.name ?? person.email}`} onClick={() => setRemoving(person)}><Trash2 className="size-4" /></Button>
          </li>)}</ul>}
        </div>}
    </SectionCard>
    <SectionCard title="What each role sees" description="Everyone sees only the companies shared with them. Preview a role to check before you share."><dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{accessRoles.map(([role, detail]) => <div key={role} className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3"><dt className="flex items-center justify-between gap-2 text-sm font-medium">{roleLabel(role)}{holds(role) > 0 && <button type="button" onClick={() => setOnlyRole(role)} className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-normal text-muted-foreground hover:text-accent" title={`Show who has ${roleLabel(role)}`}>{holds(role)} {holds(role) === 1 ? "person" : "people"}</button>}</dt><dd className="text-xs text-muted-foreground">{detail}</dd>{(role === "group_finance" || role === "group_analyst") && <Button size="sm" variant="outline" className="mt-auto w-fit" onClick={() => router.push(`/portfolio?view=overview&preview=${role}`)}><Eye className="size-3.5" />Preview as {roleLabel(role)}</Button>}</div>)}</dl></SectionCard>
    {adding && <AddPerson list={list} owner={owner} onClose={() => setAdding(false)} onDone={people.reload} />}
    {removing && <RemovePerson person={removing} onClose={() => setRemoving(null)} onDone={people.reload} />}
  </>;
}

function AddPerson({ list, owner, onClose, onDone }: { list: PortfolioCompany[]; owner: boolean; onClose: () => void; onDone: () => void }) {
  const { shares } = useRoles();
  // Only companies this person owns or administers can be shared from here.
  const owned = list.filter(shares);
  const offered = owner ? accessRoles : accessRoles.filter(([value]) => ADMIN_GIVES.includes(value));
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
      (result.done.length ? toast.success : toast.error)(outcome(result, "One invitation email sent, for"));
      onDone();
      onClose();
    } catch (failure) {
      toast.error(message(failure));
      setSaving(false);
    }
  }
  return <Dialog open onOpenChange={(value) => !value && !saving && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Add a person</DialogTitle><DialogDescription>They get one email invitation for each company you choose.</DialogDescription></DialogHeader>
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="grid gap-1.5 text-xs text-muted-foreground">Email<Input type="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <fieldset className="grid gap-1.5"><legend className="mb-1 text-xs text-muted-foreground">Role</legend>
        <div className="grid max-h-64 gap-1.5 overflow-y-auto pr-1">{offered.map(([value, detail]) => <label key={value} className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors ${role === value ? "border-accent bg-accent-muted" : "border-border hover:bg-surface-2"}`}>
          <input type="radio" name="role" className="mt-1" checked={role === value} onChange={() => setRole(value)} />
          <span><span className="block text-sm font-medium">{roleLabel(value)}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
        </label>)}</div>
      </fieldset>
      <fieldset className="grid gap-1.5"><legend className="mb-1 flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">Companies{owned.length > 1 && <button type="button" className="text-accent hover:underline" onClick={() => setCompanies(companies.length === owned.length ? [] : owned.map((item) => item.id))}>{companies.length === owned.length ? "Clear all" : "Choose all"}</button>}</legend>{owned.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={companies.includes(item.id)} onChange={() => setCompanies(companies.includes(item.id) ? companies.filter((id) => id !== item.id) : [...companies, item.id])} />{item.name}</label>)}</fieldset>
      {touched && error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Sending…" : companies.length > 1 ? `Send ${companies.length} invitations` : "Send invitation"}</Button></DialogFooter>
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
