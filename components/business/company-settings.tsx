"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, Download, Eye, EyeOff, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-ui";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import {
  CompanyEditor,
  PeopleList,
  businessModels,
  entityNames,
  usePortfolioApi,
  type PortfolioCompany,
  type PortfolioRegistration,
  type PortfolioSummary,
} from "@/features/portfolio";

/** A tax or registration number shown with its middle hidden until someone asks to see it. */
const masked = (value: string) => value.length > 5 ? `${value.slice(0, 3)}${"•".repeat(value.length - 5)}${value.slice(-2)}` : "•".repeat(value.length);

function Detail({ label, value, secret, revealed }: { label: string; value: string | null | undefined; secret?: boolean; revealed?: boolean }) {
  return <div className="min-w-0">
    <dt className="text-[11px] text-muted-foreground">{label}</dt>
    <dd className={`mt-0.5 truncate text-sm ${value ? "" : "text-muted-foreground"} ${secret && value ? "font-mono" : ""}`}>{value ? (secret && !revealed ? masked(value) : value) : "Not added"}</dd>
  </div>;
}

/**
 * The company's own record, the one the Portfolio keeps for it: its name and kind of business, how
 * to reach it, its legal registration and its people. The registration decides which filings Janus
 * tracks, so what is missing from it comes first, with the button that fixes it.
 */
export function LiveCompanyProfile({ locations }: { locations: React.ReactNode }) {
  const session = useSession();
  const summary = usePortfolioApi<PortfolioSummary>("/portfolio/summary?period=month");
  const company = summary.data?.companies.find((item) => item.current) ?? summary.data?.companies.find((item) => item.id === String(session.tenant.id));
  // As in the Portfolio: the Owner renames the company; money roles change its registration.
  const role = (item: PortfolioCompany) => session.tenants.find((tenant) => tenant.id === item.id)?.role;
  const owns = (item: PortfolioCompany) => role(item) === "owner";
  const handlesMoney = (item: PortfolioCompany) => ["owner", "group_admin", "company_admin", "finance_manager"].includes(role(item) ?? "");
  const [editing, setEditing] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);

  if (summary.loading) return <SectionCard><p className="text-sm text-muted-foreground">Loading your company&apos;s details…</p></SectionCard>;
  if (summary.error || !company) return <SectionCard title="Company profile"><p className="text-sm text-muted-foreground">{summary.error ?? "Your role cannot read this company's details. Ask its Owner."}</p></SectionCard>;

  const reg: Partial<PortfolioRegistration> = company.registration ?? {};
  const canEdit = handlesMoney(company);
  const missing = company.complianceGaps.filter((gap) => gap.kind === "missing");
  const compliance = `/portfolio?view=compliance&company=${company.id}`;
  const model = company.businessModel ? businessModels[company.businessModel]?.name : null;
  const edit = canEdit ? <Button size="sm" onClick={() => setEditing(true)}><Pencil className="size-3.5" />Edit details</Button> : null;

  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-accent">Company</p>
        <div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold tracking-tight">{company.name}</h2>{missing.length ? <Badge variant="warning">{missing.length} {missing.length === 1 ? "detail" : "details"} missing</Badge> : <Badge variant="success">Complete</Badge>}</div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">The same record your Portfolio shows. Its legal details decide which filings Janus tracks and reminds you of.</p>
      </div>
      {edit}
    </div>

    {missing.length > 0 && <SectionCard className="border-warning/40 bg-warning/5">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Add these so Janus can tell you which filings are due</p>
          <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">{missing.map((gap) => <li key={gap.text}>• {gap.text}</li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {edit ?? <p className="text-xs text-muted-foreground">Only the Owner, an admin or the finance manager can add them.</p>}
            {missing.some((gap) => gap.text.startsWith("GSTIN")) && <Button size="sm" variant="outline" asChild><Link href={compliance}>Add the GSTIN in Compliance<ArrowRight className="size-3.5" /></Link></Button>}
          </div>
        </div>
      </div>
    </SectionCard>}

    <SectionCard title="The company" description="What kind of business this is. Janus picks the measures it leads with from it.">
      <dl className="grid gap-4 sm:grid-cols-3">
        <Detail label="Name" value={company.name} />
        <Detail label="Kind of business" value={model} />
        <Detail label="Industry" value={company.industry} />
        <Detail label="Size" value={company.companySize} />
        <Detail label="Founded or incorporated" value={reg.incorporatedOn ? new Date(reg.incorporatedOn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null} />
      </dl>
      {canEdit && !owns(company) && <p className="mt-3 text-[11px] text-muted-foreground">Only the Owner changes the name, kind of business, industry and size.</p>}
    </SectionCard>

    <SectionCard title="How to reach it" description="The company's own contact details and registered address.">
      <dl className="grid gap-4 sm:grid-cols-3">
        <Detail label="Website" value={reg.website} />
        <Detail label="Email" value={reg.email} />
        <Detail label="Phone" value={reg.phone} />
        <Detail label="City" value={reg.city} />
        <Detail label="State" value={reg.state} />
        <div className="sm:col-span-3"><Detail label="Registered address" value={reg.registeredAddress} /></div>
      </dl>
    </SectionCard>

    <SectionCard title="Tax & legal" description="Hidden until you choose to see them." action={<Button size="sm" variant="secondary" onClick={() => setRevealed((value) => !value)}>{revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{revealed ? "Hide" : "Show"}</Button>}>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Detail label="Entity type" value={reg.entityType ? entityNames[reg.entityType] : null} />
        <Detail label="Legal name" value={reg.legalName} />
        <Detail label="PAN" value={reg.pan} secret revealed={revealed} />
        <div className="min-w-0">
          <Detail label="GSTIN" value={company.compliancePlan?.gstin} secret revealed={revealed} />
          <Link href={compliance} className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-accent hover:underline">{company.compliancePlan?.gstin ? "GST returns and filings" : "Add it with your GST returns"}<ArrowRight className="size-3" /></Link>
        </div>
        <Detail label="TAN" value={reg.tan} secret revealed={revealed} />
        <Detail label={reg.entityType === "llp" ? "LLPIN" : "CIN"} value={reg.cin} secret revealed={revealed} />
        <Detail label="Udyam (MSME)" value={reg.udyam} />
        <Detail label="EPF code" value={reg.epfCode} />
        <Detail label="ESI code" value={reg.esiCode} />
        <Detail label="Professional tax state" value={reg.ptState} />
      </dl>
      {!missing.length && <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><CircleCheck className="size-3.5 text-success" aria-hidden />Nothing the filings need is missing.</p>}
    </SectionCard>

    <SectionCard title="Founders and directors" description="Directors are needed for a company's or LLP's own filings.">
      <PeopleList people={reg.directors ?? []} />
    </SectionCard>

    {locations}

    {editing && <CompanyEditor item={company as PortfolioCompany} basics={owns(company)} onClose={() => setEditing(false)} onSaved={summary.reload} />}
  </div>;
}

type Member = { id: string; name: string; email: string; role: string; status: string; extra_permissions?: string[] };
type Invitation = { id: string; email: string; role: string; expires_at: string };

const roleWords: Record<string, string> = { owner: "Owner", admin: "Admin", company_admin: "Company admin", group_admin: "Group admin", manager: "Manager", agent: "Agent", finance_manager: "Finance manager", operations_manager: "Operations manager", group_finance: "Group finance", group_analyst: "Group analyst" };
/** Roles that can change people, access and settings for the whole business. */
const fullAccess = new Set(["owner", "admin", "company_admin", "group_admin"]);

/**
 * Who can get into the business, from its real member list: those who can change everything named,
 * invitations still open, and anyone switched off. The usual check after someone leaves.
 */
export function LiveAccessReview() {
  const members = useApi<Member[]>("/members");
  const invitations = useApi<Invitation[]>("/invitations");
  if (members.loading) return <p className="text-sm text-muted-foreground">Loading who has access…</p>;
  if (members.error) return <p className="text-sm text-muted-foreground">{members.error}</p>;
  const active = (members.data ?? []).filter((item) => item.status === "active");
  const disabled = (members.data ?? []).filter((item) => item.status !== "active");
  const admins = active.filter((item) => fullAccess.has(item.role));
  const extra = active.filter((item) => !fullAccess.has(item.role) && item.extra_permissions?.length);
  const open = invitations.data ?? [];
  const owners = admins.filter((item) => item.role === "owner").length;
  return <div className="flex flex-col gap-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-surface-2 p-3"><p className="text-[11px] text-muted-foreground">People with access</p><p className="mt-1 text-xl font-semibold">{active.length}</p></div>
      <div className="rounded-lg border border-border bg-surface-2 p-3"><p className="text-[11px] text-muted-foreground">Can change everything</p><p className="mt-1 text-xl font-semibold">{admins.length}</p></div>
      <div className="rounded-lg border border-border bg-surface-2 p-3"><p className="text-[11px] text-muted-foreground">Invitations not yet accepted</p><p className="mt-1 text-xl font-semibold">{invitations.error ? "—" : open.length}</p></div>
    </div>
    {owners === 1 && <p className="text-xs text-muted-foreground">There is one Owner. If they lose access to their email, nobody can change the plan or add another Owner. Consider making a trusted partner an Owner too.</p>}
    <div>
      <p className="text-sm font-medium">Who can change people, access and settings</p>
      <ul className="mt-1 divide-y divide-border">{admins.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0"><span className="font-medium">{item.name}</span> <span className="text-muted-foreground">· {item.email}</span></span><Badge variant={item.role === "owner" ? "accent" : "neutral"}>{roleWords[item.role] ?? item.role}</Badge></li>)}</ul>
    </div>
    {extra.length > 0 && <p className="text-sm text-muted-foreground">{extra.length} {extra.length === 1 ? "person has" : "people have"} workspace access on top of their role: {extra.map((item) => item.name).join(", ")}.</p>}
    {open.length > 0 && <div>
      <p className="text-sm font-medium">Invitations still open</p>
      <ul className="mt-1 divide-y divide-border">{open.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{item.email} <span className="text-muted-foreground">· {roleWords[item.role] ?? item.role}</span></span><span className="text-xs text-muted-foreground">Expires {new Date(item.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></li>)}</ul>
      <p className="text-xs text-muted-foreground">Cancel any you no longer mean to send: whoever holds the link can join.</p>
    </div>}
    {disabled.length > 0 && <p className="text-sm text-muted-foreground">Switched off, cannot sign in: {disabled.map((item) => item.name).join(", ")}.</p>}
    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
      <Button size="sm" asChild><Link href="/settings?tab=team&workspace=business">Manage people &amp; access<ArrowRight className="size-3.5" /></Link></Button>
      <Button size="sm" variant="outline" asChild><Link href="/settings?tab=security&workspace=business">Your password and signed-in devices</Link></Button>
    </div>
    <p className="text-[11px] text-muted-foreground">Two-step sign-in is not available in Janus yet.</p>
  </div>;
}

const exported = [
  ["Sales", "Leads, contacts, deals and calls"],
  ["Finance", "Invoices, payments, credit notes, bills, bank lines, budgets, payroll postings"],
  ["People", "Employees, leave, attendance and the rest of HR, and payslips"],
  ["Stock", "Items, batches, movements, purchase orders, dispatches, returns, transfers"],
  ["Projects", "Projects, milestones, tasks, timesheets, change requests"],
  ["Support", "Tickets and WhatsApp conversations"],
  ["Company", "Registration, filings, document details, rules, members and their roles"],
];

/**
 * The Owner's copy of everything the business keeps in Janus: one ZIP of spreadsheets, for an
 * accountant, an audit, a backup of their own, or moving to another system.
 */
export function LiveDataExport() {
  const session = useSession();
  const owner = (session.tenant.role ?? "").toLowerCase() === "owner";
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  async function download() {
    setBusy(true);
    try {
      const response = await fetch("/api/backend/business/export", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "The export could not be made. Try again in a minute.");
      }
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "janus-export.zip";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = name; link.click();
      URL.revokeObjectURL(url);
      setDone(name);
      toast.success("Your records are downloading.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "The export could not be made."); } finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-4">
    <ul className="grid gap-2 sm:grid-cols-2">{exported.map(([title, text]) => <li key={title} className="rounded-lg border border-border bg-surface-2 p-3"><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{text}</p></li>)}</ul>
    <p className="text-xs text-muted-foreground">One ZIP of spreadsheets (CSV) that open in Excel or Google Sheets, with a note explaining each folder. Left out on purpose: passwords, sign-in and API keys, encrypted bank account numbers, uploaded document files, and the team&apos;s chat messages.</p>
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      {owner ? <Button disabled={busy} onClick={() => void download()}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}{busy ? "Preparing your records…" : "Download all records"}</Button>
        : <p className="text-sm text-muted-foreground">Only the business&apos;s Owner can export all of its records.</p>}
      {done && <span className="text-xs text-muted-foreground">Downloaded {done}.</span>}
    </div>
    <p className="text-[11px] text-muted-foreground">Every export is recorded in the audit log with who made it. Keep the file somewhere safe: it holds customer, salary and bank details.</p>
  </div>;
}
